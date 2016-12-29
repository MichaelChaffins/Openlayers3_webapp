//const epsg = '3857';
const epsg = '4326';
const namespaceURI = 'michael.com';
const workspace = 'michael';
const databaseName = 'postgres';
const layerGroup = 'michael_layers';
const dataStore = 'openlayers';

var featureLayerName;
var interaction;
var format;
var inputProjection;
var outputProjection;

// JSONP WMS call for list of layers
function getLayerList() {
    $.ajax({
        type: 'GET',
        url: 'http://localhost:8080/geoserver/' + workspace + '/wfs?' +
        'SERVICE=WFS&VERSION=2.0.0&' +
        'REQUEST=DescribeFeatureType&' +
        'outputFormat=text/javascript',
        dataType: 'jsonp',
    });
}
getLayerList();

// callback function of WMS call that lists the layers to select
function parseResponse(jsonp) {
    var $addButton = $('<input type="button" id="addButton" value="Add Layer" onclick="addNewLayer();"/><br>');

    // exit function if no layers have been added
    if (jsonp.featureTypes.length < 1) {
        $("#layerListDiv").append($addButton);
        return;
    }

    // loop through json object and add button for each layer
    $.each(jsonp.featureTypes, function (i, item) {
        var layerName = item.typeName;
        $("#layerListDiv").append($('<input type="button" class="layerButton" value="' +
            layerName +
            '" onclick="refreshLayer(\'' + layerName + '\');"/><br><br>'));
    });

    $("#layerListDiv").append($addButton);
}

// create and add layer to database
function addNewLayer() {
    var $addButton = $('#addButton');
    var $layerForm = $('<form id="layerForm">Enter new layer name: <input type="text" name="newLayerName" id="newLayerName"><br>' +
        '<button type="button" id="cancel">Cancel</button>' +
        '<button type="button" id="submit">Submit</button></form>');
    $addButton.before($layerForm);
    $layerForm.append($addButton.children());
    $addButton.hide();

    $('#cancel').click(function () {
        $layerForm.remove();
        $addButton.show();
    });

    $('#submit').click(function () {
        var $newLayerName = $('#newLayerName').val();
        var $newLayerButton = $('<input type="button" class="layerButton" value="' + $newLayerName + '" onclick="refreshLayer(\'' + $newLayerName + '\');"/><br><br>');
        var layerXML = getLayerXML($newLayerName);

        $.ajax({
            url: 'http://localhost:8080/geoserver/rest/workspaces/' + workspace + '/datastores/' + dataStore + '/featuretypes',
            type: "POST",
            contentType: "text/xml",
            data: layerXML,
            srsName: 'EPSG:' + epsg
        }).done(function () {
            $layerForm.remove();
            $newLayerButton.insertBefore($addButton);
            $addButton.show();
        });
    });
}

// XML string to create a table in the database for a new layer
function getLayerXML(newLayerName) {
    return "<featureType>" +
        "<name>" + newLayerName + "</name>" +
        "<nativeName>" + newLayerName + "</nativeName>" +
        "<title>" + newLayerName + "</title>" +
        "<srs>EPSG:" + epsg + "</srs>" +
        "<attributes>" +
        "<attribute>" +
        "<name>geometry</name>" +
        "<binding>com.vividsolutions.jts.geom.Geometry</binding>" +
        "</attribute>" +
        "<attribute>" +
        "<name>Name</name>" +
        "<binding>java.lang.String</binding>" +
        "</attribute>" +
        "</attributes>" +
        "</featureType>";
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
    featureLayerName = layerName;
    layer = layerName;
    sourceWFS = new ol.source.Vector({
        loader: function (extent) {
            $.ajax('http://localhost:8080/geoserver/wfs', {
                type: 'GET',
                data: {
                    service: 'wfs',
                    version: '1.1.0',
                    request: 'GetFeature',
                    typename: workspace + ':' + layer,
                    srsname: 'EPSG:' + epsg,
                    bbox: extent.join(',') + ',EPSG:' + epsg,
                }
            }).done(function (response) {
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

// wfs-t
var formatGML;
var dirty = {};
var transactWFS = function (mode, f) {
    formatGML = new ol.format.GML({
        featureNS: namespaceURI,
        featureType: featureLayerName,
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
    }).done(function () {
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
                map.forEachFeatureAtPixel(e.pixel, function (feature) {
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
    var mousePositionProjection = $('#mouseProjection').val();
    mousePosition = new ol.control.MousePosition({
        coordinateFormat: ol.coordinate.createStringXY(2),
        projection: mousePositionProjection
    });
    map.addControl(mousePosition);
}
updateMouseProjection();

function updateInputProjection() {
    inputProjection = $('#inputProjection').val();
}
updateInputProjection();

function updateOutputProjection() {
    outputProjection = $('#outputProjection').val();
}
updateOutputProjection();

/**
 * CHANGE PROJECTION FORMAT


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
 */
/**
 * READ DATA FROM TEXTBOX
 */

function readData() {
    var featuresRead;
    var source = layerWFS.getSource();
    source.clear();
    var data = document.getElementById("readTextArea").value;
    if (inputProjection === "EPSG:4326") {
        to4326();
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
    if (outputProjection === "EPSG:4326") {
        //to4326();
        data = format.writeFeatures(features);
        document.getElementById("writeTextArea").innerHTML = data;
        to3857();
    } else {
        data = format.writeFeatures(features);
        document.getElementById("writeTextArea").innerHTML = JSON.stringify(JSON.parse(data), null, 2);;
    }
}

function writeSelectedFeature(selectedFeature) {
    var data;
    if (outputProjection === "EPSG:4326") {
        //to4326();
        data = format.writeFeature(selectedFeature);
        document.getElementById("writeTextArea").innerHTML = data;
        to3857();
    } else {
        data = format.writeFeature(selectedFeature);
        document.getElementById("writeTextArea").innerHTML = JSON.stringify(JSON.parse(data), null, 2);
    }
}