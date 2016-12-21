window.requestAnimFrame = (function(){
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback, element) {
            window.setTimeout(callback, 1000 / 60);
        };
})();
var requestAnimationFrame = window.requestAnimFrame;

//var epsg = '3857';
var epsg = '4326';
var namespace = 'test.issinc.com';
var workspace = 'Test';
var databaseName = 'Test';

var interaction;
var features = new ol.Collection();
var format;
var inputProjection;
var outputProjection;

function getLayers(url){
    var httpRequest = new XMLHttpRequest(); 
    httpRequest.open("GET", url, false);
    httpRequest.send(null);
    return httpRequest.responseText;          
}

function displayLayers() {
    var json_obj = JSON.parse(getLayers('http://localhost:8080/geoserver/rest/workspaces/' + workspace + '/featuretypes.json'));
    var s = $('<input type="button" id="addButton" value="Add Layer" onclick="addNewLayer();"/><br>');
    if (json_obj.featureTypes.length < 1) {
        $("#layerListDiv").append(s);
        return;
    }

    var layerList = [];
    for (var i = 0; i < json_obj.featureTypes.featureType.length; i++)
        layerList.push(json_obj.featureTypes.featureType[i].name);

    for (var j = 0; j < layerList.length; j++) {
        var layerName = layerList[j];
        var r = $('<input type="button" class="layerButton" value="' 
                + layerName 
                + '" onclick="refreshLayer(\'' + layerName + '\');"/><br><br>');
        $("#layerListDiv").append(r);    
    }
    $("#layerListDiv").append(s);
}
displayLayers();

function getLayerXML(newLayerName) {
    return "<featureType>"
          +   "<name>" + newLayerName + "</name>"
          +   "<nativeName>" + newLayerName + "</nativeName>"
          +   "<title>" + newLayerName + "</title>"
          +   "<srs>EPSG:" + epsg + "</srs>"
          +   "<attributes>"
          +     "<attribute>"
          +       "<name>geometry</name>"
          +       "<binding>com.vividsolutions.jts.geom.Geometry</binding>"
          +     "</attribute>"
          +   "<attribute>"
          +      "<name>Name</name>"
          +      "<binding>java.lang.String</binding>"
          +    "</attribute>"
          +    "</attributes>"
          +"</featureType>";
} 

function addNewLayer() {
    var newLayerName = prompt("Enter new layer name:");
    if (newLayerName === null) {
        return;
    }

    var layerName = getLayerXML(newLayerName);
    $.ajax({
        url: 'http://localhost:8080/geoserver/rest/workspaces/' + workspace + '/datastores/' + databaseName + '/featuretypes',
        type: "POST",
        contentType: "text/xml",
        data: layerName, 
        srsName: 'EPSG:4326'
    }) .done(function() {
            $("#addButton").remove();
            $('br:last-child').remove();
            $('br:last-child').remove();
            var r = $('<br><input type="button" class="layerButton" value="' + newLayerName + '" onclick="refreshLayer(\'' + newLayerName + '\');"/><br><br>');
            $("#layerListDiv").append(r);
            var s = $('<input type="button" id="addButton" value="Add Layer" onclick="addNewLayer();"/><br>');
            $("#layerListDiv").append(s); 
    });
}

var interactionSelectPointerMove = new ol.interaction.Select({
    condition: ol.events.condition.pointerMove
});

var interactionSelect = new ol.interaction.Select({
    style: new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(255, 255, 255, 0.2)'
        }),
        stroke: new ol.style.Stroke({
            color: '#ffcc33',
            width: 2
        }),
        image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({
                color: '#ffcc33'
            })
        })
    })
});

var interactionSnap;
var layerWFS = new ol.layer.Vector();
var sourceWFS;
function refreshLayer(layerName) {
    $("#currentLayer").html('');
    $("#currentLayer").append(layerName);
    gmlfeaturetype = layerName;
    layer = layerName;
    sourceWFS = new ol.source.Vector({  
    loader: function(extent) {
        $.ajax('http://localhost:8080/geoserver/wfs', {
            type: 'GET',
            data: {
                service: 'wfs',
                version: '1.1.0',
                request: 'GetFeature',
                typename: 'Test:' + layer,
                srsname: 'EPSG:' + epsg,
                //outputFormat: 'application/json',
                request: 'GetFeature',
                bbox: extent.join(',') + ',EPSG:' + epsg,
            }
        }).done(function(response) {
            sourceWFS.addFeatures(formatWFS.readFeatures(response));
        });
    },
    projection: 'EPSG:' + epsg,
    strategy: ol.loadingstrategy.bbox
    });
    layerWFS.setSource(sourceWFS);
    map.addLayer(layerWFS);
    if (interactionSnap) {
        map.removeInteraction(interactionSnap);
    }
    interactionSnap = new ol.interaction.Snap({
        source: layerWFS.getSource()
    });
}

function updateFormats() {
    var formatType = document.getElementById("formatType").value
    var formats = {
        geojson: new ol.format.GeoJSON(),
        kml: new ol.format.KML(),
        wkt: new ol.format.WKT(),       
        gpx: new ol.format.GPX(),
    };
    format = formats[formatType];
}
updateFormats();

var formatWFS = new ol.format.WFS();

var map = new ol.Map({
    target: 'map',
    controls: [],
    interactions: [
        interactionSelectPointerMove,
        new ol.interaction.MouseWheelZoom(),
        new ol.interaction.DragPan()
    ],
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        })
    ],
    view: new ol.View({
        projection: 'EPSG:' + epsg,
        center: [0, 0],
        zoom: 3,
    })
}); 
var scaleLine = new ol.control.ScaleLine();
map.addControl(scaleLine);
var zoomControl = new ol.control.Zoom();
map.addControl(zoomControl);

//wfs-t 
var formatGML;
var dirty = {};
var transactWFS = function (mode, f) {
    formatGML = new ol.format.GML({
        featureNS: namespace,
        featureType: gmlfeaturetype,
        srsName: 'EPSG:4326',
    });
    var node;
    switch (mode) {
        case 'insert':
            node = formatWFS.writeTransaction([f], null, null, formatGML);
            break;
        case 'update':
            node = formatWFS.writeTransaction(null, [f], null, formatGML);
            break;
        case 'delete':
            node = formatWFS.writeTransaction(null, null, [f], formatGML);
            break;
    }
    var payload = new XMLSerializer().serializeToString(node);
    $.ajax('http://localhost:8080/geoserver/wfs/', {
        type: 'POST',
        dataType: 'xml',
        processData: false,
        contentType: 'text/xml',
        data: payload,
    }).done(function() {
        sourceWFS.clear();
    });
};

/**
 * VECTOR INTERACTION
 */

$('button').click(function () {
    $(this).siblings().removeClass('btn-active');
    $(this).addClass('btn-active');
    map.removeInteraction(interaction);
    interactionSelect.getFeatures().clear();
    map.removeInteraction(interactionSelect);
    map.removeInteraction(interactionSnap);

    switch ($(this).attr('id')) {

        case 'btnModify':
            map.addInteraction(interactionSelect);
            interaction = new ol.interaction.Modify({
                features: interactionSelect.getFeatures()
            });
            map.addInteraction(interaction);
            map.addInteraction(interactionSnap);
            dirty = {};
            interactionSelect.getFeatures().on('add', function (e) {
                e.element.on('change', function (e) {
                    dirty[e.target.getId()] = true;
                });
            });
            interactionSelect.getFeatures().on('remove', function (e) {
                var f = e.element;
                if (dirty[f.getId()]) {
                    delete dirty[f.getId()];
                    var featureProperties = f.getProperties();
                    delete featureProperties.boundedBy;
                    var clone = new ol.Feature(featureProperties);
                    clone.setId(f.getId());
                    transactWFS('update', clone);
                }
            });
            break;

        case 'btnPoint':
            interaction = new ol.interaction.Draw({
                type: 'Point',
                srsName: 'EPSG:' + epsg,
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function (e) {
                var name = prompt("Name:");
                e.feature.set('Name', name);
                transactWFS('insert', e.feature);
            });
            break;

        case 'btnLine':
            interaction = new ol.interaction.Draw({
                type: 'LineString',
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function (e) {
                var name = prompt("Name:");
                e.feature.set('Name', name);                
                transactWFS('insert', e.feature);
            });
            break;

        case 'btnPolygon':
            interaction = new ol.interaction.Draw({
                type: 'Polygon',
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function (e) {
                var name = prompt("Name:");
                e.feature.set('Name', name);
                transactWFS('insert', e.feature);
            });

            break;

        case 'btnDelete':
            interaction = new ol.interaction.Select();
            interaction.getFeatures().on('add', function (e) {
                transactWFS('delete', e.target.item(0));
                interactionSelectPointerMove.getFeatures().clear();
                interaction.getFeatures().clear();
            });
            map.addInteraction(interaction);
            break;

        case 'btnSelect':
            interaction = new ol.interaction.Select();
            map.on("click", function (e) {
                map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
                    writeSelectedFeature(feature);
                })
            });
            break;

        default:
            break;
    }
});

/**
 * UPDATE FORMAT PROJECTIONS
 */

var mousePosition;
function updateMouseProjection() {
    if (mousePosition != null) {
        map.removeControl(mousePosition);
    }
    var mousePositionProjection = document.getElementById("mouseproj").value;
    mousePosition = new ol.control.MousePosition({
        coordinateFormat: ol.coordinate.createStringXY(2),
        projection: mousePositionProjection
    });
    map.addControl(mousePosition);
}
updateMouseProjection();

function updateInputProjection() {
    inputProjection = document.getElementById("inproj").value;
}
updateInputProjection();

function updateOutputProjection() {
    outputProjection = document.getElementById("outproj").value;
}
updateOutputProjection();

/**
 * CHANGE PROJECTION FORMAT
 */

function to4326() {
    var source = layerWFS.getSource();
    var features = source.getFeatures();
    features.forEach(function (featuresM) {
        var geometry = featuresM.getGeometry();
        geometry.transform('EPSG:3857', 'EPSG:4326');
    }); 
}

function to3857() {
    var source = layerWFS.getSource();
    var features = source.getFeatures();
    features.forEach(function (featuresM){
        var geometry = featuresM.getGeometry();
        geometry.transform('EPSG:4326', 'EPSG:3857');
    });
}

/**
 * READ DATA FROM TEXTBOX
 */

function readData() {
    var featuresRead;
    var source = layerWFS.getSource();
    source.clear();
    var data = document.getElementById("readTextArea").value;
    if(inputProjection === "EPSG:4326") {
        to4326()
        featuresRead = format.readFeatures(data);
        source.addFeatures(featuresRead);
        to3857();
    } else {
        featuresRead = format.readFeatures(data);
        source.addFeatures(featuresRead);
    }
}

/** 
 * WRITE DATA TO TEXTBOX
*/

function writeAllFeatures() {
    var data;
    var source = layerWFS.getSource();
    var features = source.getFeatures();
    if(outputProjection === "EPSG:4326") {
        to4326();
        data = format.writeFeatures(features);
        document.getElementById("writeTextArea").innerHTML = data;
        to3857();
    } else {
        data = format.writeFeatures(features);
        var jsonPretty = JSON.stringify(JSON.parse(data),null,2);  
        document.getElementById("writeTextArea").innerHTML = jsonPretty;
    }
}

function writeSelectedFeature(selectedFeature) {
    var data;
    if(outputProjection === "EPSG:4326") {
        to4326();
        data = format.writeFeature(selectedFeature);
        document.getElementById("writeTextArea").innerHTML = data;
        to3857();
    } else {
        data = format.writeFeature(selectedFeature);
        var jsonPretty = JSON.stringify(JSON.parse(data),null,2);
        document.getElementById("writeTextArea").innerHTML = jsonPretty;
    }
}
