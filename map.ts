import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

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

interface EntityData {
  ASSOCIATED_PINS: string[];
  COUNT: number;
}

const pinDocumentsCache = new Map<string, PinDocumentData>();
const entityDataCache = new Map<string, EntityData>();
const loadingPins = new Set<string>();
const loadingEntities = new Set<string>();
const PIN_API_PATH = "https://cdn.deeddish.com/pin/";
const ENTITY_API_PATH = "https://cdn.deeddish.com/entity/";
const ENTITY_MAPPING_PATH = "https://cdn.deeddish.com/entity_files.json";

// Entity files mapping (grantee name -> filename)
let entityFilesMapping: Record<string, string> = {};
let entityMappingLoaded = false;

// Load entity files mapping
async function loadEntityMapping(): Promise<void> {
  if (entityMappingLoaded) return;

  try {
    const response = await fetch(ENTITY_MAPPING_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load entity mapping: ${response.status}`);
    }
    entityFilesMapping = await response.json();
    entityMappingLoaded = true;
    console.log(
      `Loaded entity mapping with ${Object.keys(entityFilesMapping).length} entries`,
    );
  } catch (error) {
    console.error("Error loading entity mapping:", error);
    entityFilesMapping = {};
    entityMappingLoaded = true;
  }
}

// Get filename for a grantee name
function getEntityFileName(granteeName: string): string | null {
  return entityFilesMapping[granteeName] || null;
}

// UI element references
let parcelDetailsElement: HTMLElement;
let loadingIndicatorElement: HTMLElement;
let errorMessageElement: HTMLElement;
let documentListElement: HTMLElement;
let granteeInfoElement: HTMLElement;
let granteeDetailsElement: HTMLElement;
let granteeCountElement: HTMLElement;

// State for grantee highlighting
let selectedGrantee: string | null = null;
let selectedParcelPin: string | null = null;
let highlightedGranteeParcels: string[] = [];
let map: maplibregl.Map;

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

    const data = (await response.json()) as PinDocumentData;

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

async function loadEntityData(granteeName: string): Promise<EntityData | null> {
  // Ensure entity mapping is loaded
  await loadEntityMapping();

  const filename = getEntityFileName(granteeName);
  if (!filename) {
    console.log(`No entity mapping found for grantee: ${granteeName}`);
    return null;
  }

  // Check cache first
  if (entityDataCache.has(filename)) {
    return entityDataCache.get(filename)!;
  }

  // Check if already loading
  if (loadingEntities.has(filename)) {
    // Wait for existing load to complete
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (entityDataCache.has(filename)) {
          clearInterval(checkInterval);
          resolve(entityDataCache.get(filename)!);
        } else if (!loadingEntities.has(filename)) {
          // Loading failed
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  }

  loadingEntities.add(filename);

  try {
    const response = await fetch(`${ENTITY_API_PATH}${filename}`);
    if (!response.ok) {
      if (response.status === 404) {
        // No entity file for this grantee
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as EntityData;

    // Cache the result
    entityDataCache.set(filename, data);
    return data;
  } catch (error) {
    console.error(
      `Error loading entity data for ${granteeName} (${filename}):`,
      error,
    );
    return null;
  } finally {
    loadingEntities.delete(filename);
  }
}

// Function to check if a grantee has entity data (async)
async function checkGranteeExists(granteeName: string): Promise<boolean> {
  // Ensure entity mapping is loaded
  await loadEntityMapping();

  const filename = getEntityFileName(granteeName);
  if (!filename) {
    return false;
  }

  // Check cache first
  if (entityDataCache.has(filename)) {
    return true;
  }

  try {
    const response = await fetch(`${ENTITY_API_PATH}${filename}`, {
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Function to render documents in the info panel
async function renderDocuments(
  pin: string,
  addresses: string[],
  documents: Document[],
) {
  // Update parcel details
  if (addresses.length > 0) {
    parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}<br><strong>Address:</strong> ${addresses.join(", ")}`;
  } else {
    parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}<br><em>No address information available</em>`;
  }

  // Clear document list
  documentListElement.innerHTML = "";

  if (documents.length === 0) {
    documentListElement.innerHTML =
      '<p style="color: #666; font-style: italic;">No documents found for this parcel.</p>';
    return;
  }

  // Sort documents by DATE_RECORDED (newest first)
  const sortedDocs = [...documents].sort((a, b) => {
    const dateA = new Date(a.DATE_RECORDED).getTime();
    const dateB = new Date(b.DATE_RECORDED).getTime();
    return dateB - dateA;
  });

  // Create document list HTML with async grantee link checking
  const docResults = await Promise.all(
    sortedDocs.map(async (doc) => {
      const formattedDate = new Date(doc.DATE_RECORDED).toLocaleDateString();
      const consideration = doc.CONSIDERATION_AMOUNT
        ? ` - ${doc.CONSIDERATION_AMOUNT}`
        : "";

      // Process grantees to make them clickable if entity data exists
      const granteePromises = doc.GRANTEES.map(async (grantee) => {
        const hasEntityData = await checkGranteeExists(grantee);
        if (hasEntityData) {
          return `<a href="#" class="grantee-link" data-grantee="${grantee}" style="color: #ff6b35; text-decoration: none; cursor: pointer; border-bottom: 1px dotted #ff6b35;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${grantee}</a>`;
        } else {
          return grantee;
        }
      });

      const granteeLinks = await Promise.all(granteePromises);
      const granteesText =
        granteeLinks.length > 0 ? ` to ${granteeLinks.join(", ")}` : "";

      return {
        html: `
                <div style="margin-bottom: 12px; padding: 10px; border-left: 3px solid #2196F3; background: #f9f9f9;">
                    <div style="margin-bottom: 5px;">
                        <strong><a href="${doc.DOC_URL}" target="_blank" style="color: #2196F3; text-decoration: none;">
                            ${doc.DOC_NUM}
                        </a></strong>
                        <span style="color: #666; margin-left: 10px;">${formattedDate}</span>
                    </div>
                    <div style="color: #333; font-size: 14px;">
                        ${doc.DOC_TYPE}${consideration}${granteesText}
                    </div>
                </div>
            `,
        grantees: doc.GRANTEES,
      };
    }),
  );

  const docsHtml = docResults.map((result) => result.html).join("");

  documentListElement.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #333;">Documents (${documents.length})</h4>
        ${docsHtml}
    `;

  // Add click event listeners to grantee links
  const granteeLinks = documentListElement.querySelectorAll(".grantee-link");
  granteeLinks.forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const granteeName = (e.target as HTMLElement).getAttribute(
        "data-grantee",
      );
      if (granteeName) {
        try {
          await highlightGranteeParcels(granteeName, pin);
        } catch (error) {
          console.error("Error in grantee click handler:", error);
        }
      }
    });
  });
}

// Function to clear grantee highlights
function clearGranteeHighlights() {
  map.setFilter("parcels-highlight-grantee", ["in", "name", ""]);
  map.setFilter("parcels-highlight-selected", ["in", "name", ""]);
  selectedGrantee = null;
  selectedParcelPin = null;
  highlightedGranteeParcels = [];
  granteeInfoElement.style.display = "none";
}

// Function to highlight parcels associated with a grantee
async function highlightGranteeParcels(granteeName: string, originPin: string) {
  try {
    console.log(`Loading entity data for grantee: ${granteeName}`);

    const entityData = await loadEntityData(granteeName);
    if (!entityData || entityData.ASSOCIATED_PINS.length === 0) {
      console.log(`No entity data found for grantee: ${granteeName}`);
      return;
    }

    // Clear any existing highlights
    clearGranteeHighlights();

    // Update state
    selectedGrantee = granteeName;
    selectedParcelPin = originPin;
    highlightedGranteeParcels = entityData.ASSOCIATED_PINS;

    console.log(
      `Highlighting ${entityData.ASSOCIATED_PINS.length} parcels for ${granteeName}`,
    );

    // Highlight grantee parcels (orange)
    map.setFilter("parcels-highlight-grantee", [
      "in",
      "name",
      ...entityData.ASSOCIATED_PINS,
    ]);

    // Highlight selected parcel (bright outline)
    map.setFilter("parcels-highlight-selected", ["in", "name", originPin]);

    // Update UI
    granteeDetailsElement.textContent = granteeName;
    granteeCountElement.textContent = `Showing ${entityData.ASSOCIATED_PINS.length} parcels`;
    granteeInfoElement.style.display = "block";

    // Query features to get geometries for zoom-to-fit
    const granteeFeatures = map.querySourceFeatures("parcels", {
      sourceLayer: "parcels",
      filter: ["in", "name", ...entityData.ASSOCIATED_PINS],
    });

    granteeFeatures.forEach((feature) => {
      map.setFeatureState(
        { source: "parcels", sourceLayer: "parcels", id: feature.id },
        { clicked: false },
      );
    });

    if (granteeFeatures.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      granteeFeatures.forEach((feature) => {
        if (feature.geometry && feature.geometry.type === "Polygon") {
          // Add all coordinates of the polygon to the bounds
          feature.geometry.coordinates[0].forEach((coord: number[]) => {
            bounds.extend(coord);
          });
        } else if (
          feature.geometry &&
          feature.geometry.type === "MultiPolygon"
        ) {
          // Handle MultiPolygon geometries
          feature.geometry.coordinates.forEach((polygon: number[][][]) => {
            polygon[0].forEach((coord: number[]) => {
              bounds.extend(coord);
            });
          });
        }
      });

      // Zoom to fit all highlighted parcels with padding
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 16,
        });
        console.log(
          `Zoomed to fit ${granteeFeatures.length} highlighted parcels`,
        );
      }
    } else {
      console.log("No grantee parcels found in current map view");
    }
  } catch (error) {
    console.error(
      `Error highlighting grantee parcels for ${granteeName}:`,
      error,
    );
  }
}

// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", async () => {
  // Get UI element references
  parcelDetailsElement = document.getElementById("parcel-details")!;
  loadingIndicatorElement = document.getElementById("loading-indicator")!;
  errorMessageElement = document.getElementById("error-message")!;
  documentListElement = document.getElementById("document-list")!;
  granteeInfoElement = document.getElementById("grantee-info")!;
  granteeDetailsElement = document.getElementById("grantee-details")!;
  granteeCountElement = document.getElementById("grantee-count")!;

  // Load entity mapping on startup
  await loadEntityMapping();

  // Register the PMTiles protocol
  let protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [-87.693, 41.916],
    zoom: 12,
  });

  let hoverPin = null;
  let clickedParcel = null;

  map.on("load", () => {
    console.log("Map loaded, adding PMTiles source...");

    map.addSource("parcels", {
      type: "vector",
      url: "pmtiles://https://cdn.deeddish.com/nbd_parcels.pmtiles",
      promoteId: "name",
    });

    // Add the layer with the correct source-layer name
    map.addLayer({
      id: "parcels-fill",
      type: "fill",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "clicked"], false],
          "#FF0",
          "#6CF",
        ],
        "fill-opacity": 0.8,
        "fill-outline-color": "#3AD",
      },
    });

    // Add highlight layer for grantee-associated parcels (orange)
    map.addLayer({
      id: "parcels-highlight-grantee",
      type: "fill",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "fill-color": "#ff6b35",
        "fill-opacity": 0.7,
      },
      filter: ["in", "name", ""], // Initially hide all parcels
    });

    // Add highlight layer for selected parcel (bright outline)
    map.addLayer({
      id: "parcels-highlight-selected",
      type: "line",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "line-color": "#FF0",
        "line-width": 4,
        "line-opacity": 1,
      },
      filter: ["in", "name", ""], // Initially hide all parcels
    });

    // Add outline for hover parcels
    map.addLayer({
      id: "parcels-hover",
      type: "line",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "line-color": "#888",
        "line-width": 4,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
      },
    });
    console.log("Added parcels layer - you should see data now!");
  });
  // When the user moves their mouse over the state-fill layer, we'll update the
  // feature state for the feature under the mouse.
  map.on("mousemove", "parcels-fill", (e) => {
    if (e.features.length > 0) {
      if (hoverPin) {
        map.setFeatureState(
          { source: "parcels", sourceLayer: "parcels", id: hoverPin },
          { hover: false },
        );
      }
      hoverPin = e.features[0].id;
      map.setFeatureState(
        { source: "parcels", sourceLayer: "parcels", id: hoverPin },
        { hover: true },
      );
    }
  });

  // When the mouse leaves the state-fill layer, update the feature state of the
  // previously hovered feature.
  map.on("mouseleave", "parcels-fill", () => {
    if (hoverPin) {
      map.setFeatureState(
        { source: "parcels", sourceLayer: "parcels", id: hoverPin },
        { hover: false },
      );
    }
    hoverPin = null;
  });

  // Click handler for loading PIN documents
  map.on("click", async (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ["parcels-fill"],
    });

    if (features.length === 0) {
      console.log("No parcel clicked");
      // Clear individual clicked parcel
      if (clickedParcel) {
        map.setFeatureState(
          { source: "parcels", sourceLayer: "parcels", id: clickedParcel },
          { clicked: false },
        );
      }
      // Clear grantee highlights when clicking empty area
      clearGranteeHighlights();

      // Reset UI
      parcelDetailsElement.textContent =
        "Click on a parcel to see property documents";
      documentListElement.innerHTML = "";
      errorMessageElement.style.display = "none";
      return;
    }

    if (clickedParcel) {
      map.setFeatureState(
        { source: "parcels", sourceLayer: "parcels", id: clickedParcel },
        { clicked: false },
      );
    }

    const parcel = features[0];
    clickedParcel = features[0].id;

    if (clickedParcel) {
      map.setFeatureState(
        { source: "parcels", sourceLayer: "parcels", id: clickedParcel },
        { clicked: true },
      );
    }

    // Extract PIN from feature properties
    const pin = parcel.properties?.name;
    if (!pin) {
      console.error("No PIN found in parcel properties:", parcel.properties);
      return;
    }

    // Update UI with parcel info and show loading
    parcelDetailsElement.innerHTML = `<strong>PIN:</strong> ${pin}`;
    documentListElement.innerHTML = "";
    loadingIndicatorElement.style.display = "block";
    errorMessageElement.style.display = "none";

    console.log(`Loading documents for PIN: ${pin}...`);
    map.getCanvas().style.cursor = "wait";

    try {
      const pinData = await loadPinDocuments(pin);
      console.log(`Loaded ${pinData.DOCS.length} documents for PIN ${pin}`);

      // Render the documents
      await renderDocuments(pin, pinData.ADDRESSES, pinData.DOCS);
    } catch (error) {
      console.error("Failed to load PIN documents:", error);

      // Show error in UI
      errorMessageElement.textContent = `Error loading documents for parcel ${pin}`;
      errorMessageElement.style.display = "block";
      documentListElement.innerHTML = "";
    } finally {
      // Reset loading state
      loadingIndicatorElement.style.display = "none";
      map.getCanvas().style.cursor = "";
    }
  });
});
