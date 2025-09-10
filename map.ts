import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

console.log("Map module loaded!");

// PIN Document cache and loading system
interface Document {
    DOC_NUM: string;
    DOC_TYPE: string;
    DATE_EXECUTED: string;
    DATE_RECORDED: string;
    DOC_URL: string;
    CONSIDERATION_AMOUNT: string | null;
    GRANTEES: string[];
}

interface PinDocumentData {
    ADDRESSES: string[];
    DOCS: Document[];
}

const pinDocumentsCache = new Map<string, PinDocumentData>();
const loadingPins = new Set<string>();
const PIN_API_PATH = '/data/pin/';

// UI element references
let parcelDetailsElement: HTMLElement;
let loadingIndicatorElement: HTMLElement;
let errorMessageElement: HTMLElement;
let documentListElement: HTMLElement;

async function loadPinDocuments(pin: string): Promise<PinDocumentData> {
    // Check cache first
    if (pinDocumentsCache.has(pin)) {
        return pinDocumentsCache.get(pin)!;
    }
    
    // Check if already loading
    if (loadingPins.has(pin)) {
        // Wait for existing load to complete
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (pinDocumentsCache.has(pin)) {
                    clearInterval(checkInterval);
                    resolve(pinDocumentsCache.get(pin)!);
                } else if (!loadingPins.has(pin)) {
                    // Loading failed
                    clearInterval(checkInterval);
                    reject(new Error(`Failed to load documents for PIN ${pin}`));
                }
            }, 100);
        });
    }
    
    loadingPins.add(pin);
    
    try {
        const response = await fetch(`${PIN_API_PATH}${pin}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                // No document file for this PIN
                const emptyData: PinDocumentData = { ADDRESSES: [], DOCS: [] };
                pinDocumentsCache.set(pin, emptyData);
                return emptyData;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as PinDocumentData;
        
        // Cache the result
        pinDocumentsCache.set(pin, data);
        return data;
        
    } catch (error) {
        console.error(`Error loading PIN documents for ${pin}:`, error);
        // Cache empty result to avoid repeated failures
        const emptyData: PinDocumentData = { ADDRESSES: [], DOCS: [] };
        pinDocumentsCache.set(pin, emptyData);
        return emptyData;
        
    } finally {
        loadingPins.delete(pin);
    }
}

// Function to render documents in the info panel
function renderDocuments(pin: string, addresses: string[], documents: Document[]) {
    // Update parcel details
    if (addresses.length > 0) {
        parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}<br><strong>Address:</strong> ${addresses.join(', ')}`;
    } else {
        parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}<br><em>No address information available</em>`;
    }
    
    // Clear document list
    documentListElement.innerHTML = '';
    
    if (documents.length === 0) {
        documentListElement.innerHTML = '<p style="color: #666; font-style: italic;">No documents found for this parcel.</p>';
        return;
    }
    
    // Sort documents by DATE_RECORDED (newest first)
    const sortedDocs = [...documents].sort((a, b) => {
        const dateA = new Date(a.DATE_RECORDED).getTime();
        const dateB = new Date(b.DATE_RECORDED).getTime();
        return dateB - dateA;
    });
    
    // Create document list HTML
    const docsHtml = sortedDocs.map(doc => {
        const formattedDate = new Date(doc.DATE_RECORDED).toLocaleDateString();
        const consideration = doc.CONSIDERATION_AMOUNT ? ` - ${doc.CONSIDERATION_AMOUNT}` : '';
        const grantees = doc.GRANTEES.length > 0 ? ` to ${doc.GRANTEES.join(', ')}` : '';
        
        return `
            <div style="margin-bottom: 12px; padding: 10px; border-left: 3px solid #2196F3; background: #f9f9f9;">
                <div style="margin-bottom: 5px;">
                    <strong><a href="${doc.DOC_URL}" target="_blank" style="color: #2196F3; text-decoration: none;">
                        ${doc.DOC_NUM}
                    </a></strong>
                    <span style="color: #666; margin-left: 10px;">${formattedDate}</span>
                </div>
                <div style="color: #333; font-size: 14px;">
                    ${doc.DOC_TYPE}${consideration}${grantees}
                </div>
            </div>
        `;
    }).join('');
    
    documentListElement.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #333;">Documents (${documents.length})</h4>
        ${docsHtml}
    `;
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Get UI element references
    parcelDetailsElement = document.getElementById('parcel-details')!;
    loadingIndicatorElement = document.getElementById('loading-indicator')!;
    errorMessageElement = document.getElementById('error-message')!;
    documentListElement = document.getElementById('document-list')!;
    
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
        
        
        console.log("Added parcels layer - you should see data now!");
    });


    // Click handler for loading PIN documents
    map.on('click', async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['parcels-layer']
        });
        
        if (features.length === 0) {
            console.log("No parcel clicked");
            // Reset UI
            parcelDetailsElement.textContent = 'Click on a parcel to see property documents';
            documentListElement.innerHTML = '';
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
        
        // Update UI with parcel info and show loading
        parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}`;
        documentListElement.innerHTML = '';
        loadingIndicatorElement.style.display = 'block';
        errorMessageElement.style.display = 'none';
        
        console.log(`Loading documents for PIN: ${pin}...`);
        map.getCanvas().style.cursor = 'wait';
        
        try {
            const pinData = await loadPinDocuments(pin);
            console.log(`Loaded ${pinData.DOCS.length} documents for PIN ${pin}`);
            
            // Render the documents
            renderDocuments(pin, pinData.ADDRESSES, pinData.DOCS);
            
        } catch (error) {
            console.error("Failed to load PIN documents:", error);
            
            // Show error in UI
            errorMessageElement.textContent = `Error loading documents for parcel ${pin}`;
            errorMessageElement.style.display = 'block';
            documentListElement.innerHTML = '';
        } finally {
            // Reset loading state
            loadingIndicatorElement.style.display = 'none';
            map.getCanvas().style.cursor = '';
        }
    });
});
