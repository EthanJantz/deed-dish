import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

console.log("Map module loaded!");

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Register the PMTiles protocol
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    var map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [-87.693, 41.916], // Chicago area based on bounds
        zoom: 12
    });

    map.on('load', () => {
        console.log("Map loaded, adding PMTiles source...");
        
        map.addSource('parcels', {
            type: 'vector',
            url: 'pmtiles://http://localhost:23000/data/nbd_parcels.pmtiles'
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

    // Simple click handler
    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point);
        console.log("Click result:", features.length > 0 ? features[0] : "No features found");
    });
});
