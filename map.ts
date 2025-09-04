import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

console.log("Map module loaded!");

// PIN Relations cache and loading system
interface RelationshipData {
    legal_description?: string[];
    shared_grantee?: string[];
}

const pinRelationsCache = new Map<string, RelationshipData>();
const loadingPins = new Set<string>();
const R2_BASE_URL = 'https://pub-cc2d6076b2c24c8b890a71ee6903ed40.r2.dev/';

// Performance optimization variables
let clickTimeout: number | null = null;
let currentHighlightedPins = {
    legal_description: [] as string[],
    shared_grantee: [] as string[]
};

// UI element references for relationship controls
let legalDescToggle: HTMLInputElement;
let sharedGranteeToggle: HTMLInputElement;
let legalDescCount: HTMLElement;
let sharedGranteeCount: HTMLElement;

// UI element references
let parcelDetailsElement: HTMLElement;
let loadingIndicatorElement: HTMLElement;
let relationCountElement: HTMLElement;
let errorMessageElement: HTMLElement;

async function loadPinRelations(pin: string): Promise<RelationshipData> {
    // Check cache first
    if (pinRelationsCache.has(pin)) {
        return pinRelationsCache.get(pin)!;
    }
    
    // Check if already loading
    if (loadingPins.has(pin)) {
        // Wait for existing load to complete
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (pinRelationsCache.has(pin)) {
                    clearInterval(checkInterval);
                    resolve(pinRelationsCache.get(pin)!);
                } else if (!loadingPins.has(pin)) {
                    // Loading failed
                    clearInterval(checkInterval);
                    reject(new Error(`Failed to load relations for PIN ${pin}`));
                }
            }, 100);
        });
    }
    
    loadingPins.add(pin);
    
    try {
        const response = await fetch(`${R2_BASE_URL}${pin}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                // No relations file for this PIN
                const emptyRelations: RelationshipData = {};
                pinRelationsCache.set(pin, emptyRelations);
                return emptyRelations;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const relations = data[pin] || {};
        
        // Cache the result
        pinRelationsCache.set(pin, relations);
        return relations;
        
    } catch (error) {
        console.error(`Error loading PIN relations for ${pin}:`, error);
        // Cache empty result to avoid repeated failures
        const emptyRelations: RelationshipData = {};
        pinRelationsCache.set(pin, emptyRelations);
        return emptyRelations;
        
    } finally {
        loadingPins.delete(pin);
    }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Get UI element references
    parcelDetailsElement = document.getElementById('parcel-details')!;
    loadingIndicatorElement = document.getElementById('loading-indicator')!;
    relationCountElement = document.getElementById('relation-count')!;
    errorMessageElement = document.getElementById('error-message')!;
    
    // Get relationship control references
    legalDescToggle = document.getElementById('legal-description-toggle') as HTMLInputElement;
    sharedGranteeToggle = document.getElementById('shared-grantee-toggle') as HTMLInputElement;
    legalDescCount = document.getElementById('legal-description-count')!;
    sharedGranteeCount = document.getElementById('shared-grantee-count')!;
    
    // Register the PMTiles protocol
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    var map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [-87.693, 41.916],
        zoom: 12
    });

    map.on('load', () => {
        console.log("Map loaded, adding PMTiles source...");
        
        map.addSource('parcels', {
            type: 'vector',
            url: 'pmtiles://https://pub-cc2d6076b2c24c8b890a71ee6903ed40.r2.dev/nbd_parcels.pmtiles'
        });
        
        // Add the layer with the correct source-layer name
        map.addLayer({
            'id': 'parcels-layer',
            'type': 'fill',
            'source': 'parcels',
            'source-layer': 'parcels', // Now we know it's 'parcels'
            'paint': {
                'fill-color': '#088',
                'fill-opacity': 0.8
            }
        });
        
        // Add highlight layers for different relationship types
        map.addLayer({
            'id': 'parcels-highlight-legal-description',
            'type': 'fill',
            'source': 'parcels',
            'source-layer': 'parcels',
            'paint': {
                'fill-color': '#2196F3',
                'fill-opacity': 0.7
            },
            'filter': ['in', 'name', ''] // Initially hide all parcels
        });
        
        map.addLayer({
            'id': 'parcels-highlight-shared-grantee',
            'type': 'fill',
            'source': 'parcels',
            'source-layer': 'parcels',
            'paint': {
                'fill-color': '#ff6b35',
                'fill-opacity': 0.7
            },
            'filter': ['in', 'name', ''] // Initially hide all parcels
        });
        
        console.log("Added parcels layer - you should see data now!");
    });

    // Function to update highlights based on checkbox states
    function updateHighlights() {
        const showLegalDesc = legalDescToggle.checked;
        const showSharedGrantee = sharedGranteeToggle.checked;
        
        if (showLegalDesc && currentHighlightedPins.legal_description.length > 0) {
            map.setFilter('parcels-highlight-legal-description', ['in', 'name', ...currentHighlightedPins.legal_description]);
        } else {
            map.setFilter('parcels-highlight-legal-description', ['in', 'name', '']);
        }
        
        if (showSharedGrantee && currentHighlightedPins.shared_grantee.length > 0) {
            map.setFilter('parcels-highlight-shared-grantee', ['in', 'name', ...currentHighlightedPins.shared_grantee]);
        } else {
            map.setFilter('parcels-highlight-shared-grantee', ['in', 'name', '']);
        }
    }

    // Add event listeners for checkboxes
    legalDescToggle.addEventListener('change', updateHighlights);
    sharedGranteeToggle.addEventListener('change', updateHighlights);

    // Enhanced click handler for PIN relations with performance optimizations
    map.on('click', async (e) => {
        // Debounce rapid clicks
        if (clickTimeout) {
            clearTimeout(clickTimeout);
        }
        
        clickTimeout = setTimeout(async () => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: ['parcels-layer']
            });
            
            if (features.length === 0) {
                console.log("No parcel clicked");
                // Clear highlights when clicking empty area
                if (currentHighlightedPins.legal_description.length > 0 || currentHighlightedPins.shared_grantee.length > 0) {
                    map.setFilter('parcels-highlight-legal-description', ['in', 'name', '']);
                    map.setFilter('parcels-highlight-shared-grantee', ['in', 'name', '']);
                    currentHighlightedPins = { legal_description: [], shared_grantee: [] };
                    console.log('Cleared highlights');
                }
                // Reset UI
                parcelDetailsElement.textContent = 'Click on a parcel to see related properties';
                relationCountElement.textContent = '';
                legalDescCount.textContent = '(0)';
                sharedGranteeCount.textContent = '(0)';
                errorMessageElement.style.display = 'none';
                return;
            }
            
            const parcel = features[0];
            
            // Extract PIN from feature properties
            const pin = parcel.properties?.name;
            if (!pin) {
                console.error("No PIN found in parcel properties:", parcel.properties);
                return;
            }
            
            // Skip if we're already highlighting this PIN's relations
            if (currentHighlightedPins.legal_description.includes(pin) || currentHighlightedPins.shared_grantee.includes(pin)) {
                console.log(`PIN ${pin} relations already highlighted`);
                return;
            }
            
            // Update UI with parcel info and show loading
            parcelDetailsElement.textContent = `Selected parcel: ${pin}`;
            loadingIndicatorElement.style.display = 'block';
            relationCountElement.textContent = '';
            errorMessageElement.style.display = 'none';
            
            // Show loading feedback
            console.log(`Loading relations for PIN: ${pin}...`);
            map.getCanvas().style.cursor = 'wait';
            
            try {
                const relations = await loadPinRelations(pin);
                const legalDescRelations = relations.legal_description || [];
                const sharedGranteeRelations = relations.shared_grantee || [];
                
                console.log(`Found ${legalDescRelations.length} legal description relations and ${sharedGranteeRelations.length} shared grantee relations for PIN ${pin}`);
                
                // Process legal description relations
                const legalDescParcels = legalDescRelations.length > 0 ? 
                    map.querySourceFeatures('parcels', {
                        sourceLayer: 'parcels',
                        filter: ['in', 'name', ...legalDescRelations]
                    }) : [];
                
                const legalDescPins = legalDescParcels.map(feature => feature.properties?.name).filter(Boolean);
                const uniqueLegalDescPins = [...new Set(legalDescPins)]; // Remove duplicates
                
                // Process shared grantee relations
                const sharedGranteeParcels = sharedGranteeRelations.length > 0 ? 
                    map.querySourceFeatures('parcels', {
                        sourceLayer: 'parcels',
                        filter: ['in', 'name', ...sharedGranteeRelations]
                    }) : [];
                
                const sharedGranteePins = sharedGranteeParcels.map(feature => feature.properties?.name).filter(Boolean);
                const uniqueSharedGranteePins = [...new Set(sharedGranteePins)]; // Remove duplicates
                
                // Optimize for large relation sets - limit to reasonable number
                const maxHighlights = 1000;
                const legalDescToHighlight = uniqueLegalDescPins.slice(0, maxHighlights);
                const sharedGranteeToHighlight = uniqueSharedGranteePins.slice(0, maxHighlights);
                
                console.log(`PIN ${pin} - Legal Description: ${legalDescRelations.length} total, ${uniqueLegalDescPins.length} in tilemap`);
                console.log(`PIN ${pin} - Shared Grantee: ${sharedGranteeRelations.length} total, ${uniqueSharedGranteePins.length} in tilemap`);
                
                // Update current highlighted pins
                currentHighlightedPins.legal_description = legalDescToHighlight;
                currentHighlightedPins.shared_grantee = sharedGranteeToHighlight;
                
                // Update UI counts
                legalDescCount.textContent = `(${legalDescRelations.length})`;
                sharedGranteeCount.textContent = `(${sharedGranteeRelations.length})`;
                
                // Apply highlights based on checkbox states
                updateHighlights();
                
                // Calculate bounding box for zoom-to-fit (include all relation types)
                const allParcels = [...legalDescParcels, ...sharedGranteeParcels];
                
                if (allParcels.length > 0) {
                    const bounds = new maplibregl.LngLatBounds();
                    allParcels.forEach(parcel => {
                        if (parcel.geometry && parcel.geometry.type === 'Polygon') {
                            // Add all coordinates of the polygon to the bounds
                            parcel.geometry.coordinates[0].forEach((coord: number[]) => {
                                bounds.extend(coord);
                            });
                        } else if (parcel.geometry && parcel.geometry.type === 'MultiPolygon') {
                            // Handle MultiPolygon geometries
                            parcel.geometry.coordinates.forEach((polygon: number[][][]) => {
                                polygon[0].forEach((coord: number[]) => {
                                    bounds.extend(coord);
                                });
                            });
                        }
                    });
                    
                    // Zoom to fit all highlighted parcels with some padding
                    if (!bounds.isEmpty()) {
                        map.fitBounds(bounds, {
                            padding: { top: 50, bottom: 50, left: 50, right: 50 },
                            maxZoom: 16 // Don't zoom in too close
                        });
                        console.log('Zoomed to fit highlighted parcels');
                    }
                    
                    // Update UI with success info
                    const totalRelations = legalDescRelations.length + sharedGranteeRelations.length;
                    const totalVisible = uniqueLegalDescPins.length + uniqueSharedGranteePins.length;
                    relationCountElement.textContent = `Found ${totalRelations} total related parcels, ${totalVisible} visible on map`;
                } else {
                    console.log('No related parcels found in tilemap to highlight');
                    
                    // Update UI for no relations case
                    const totalRelations = legalDescRelations.length + sharedGranteeRelations.length;
                    if (totalRelations > 0) {
                        relationCountElement.textContent = `Found ${totalRelations} related parcels, but none are visible on the current map`;
                    } else {
                        relationCountElement.textContent = 'No related parcels found for this parcel';
                    }
                }
                
            } catch (error) {
                console.error("Failed to load PIN relations:", error);
                // Clear highlights on error
                map.setFilter('parcels-highlight-legal-description', ['in', 'name', '']);
                map.setFilter('parcels-highlight-shared-grantee', ['in', 'name', '']);
                currentHighlightedPins = { legal_description: [], shared_grantee: [] };
                
                // Show error in UI
                errorMessageElement.textContent = `Error loading relations for parcel ${pin}`;
                errorMessageElement.style.display = 'block';
                relationCountElement.textContent = '';
                legalDescCount.textContent = '(0)';
                sharedGranteeCount.textContent = '(0)';
            } finally {
                // Reset loading state
                loadingIndicatorElement.style.display = 'none';
                map.getCanvas().style.cursor = '';
                clickTimeout = null;
            }
        }, 150); // 150ms debounce delay
    });
});
