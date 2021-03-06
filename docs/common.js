var originalInitTile = L.GridLayer.prototype._initTile;
    if (!originalInitTile.isPatched){

    L.GridLayer.include({
        _initTile: function (tile) {
            originalInitTile.call(this, tile);

            var tileSize = this.getTileSize();

            tile.style.width = tileSize.x + 1 + 'px';
            tile.style.height = tileSize.y + 1 + 'px';
        }
    });

    L.GridLayer.prototype._initTile.isPatched = true;
  }

(function (window, document, undefined) {

  L.Control.ZoomIndicator = L.Control.extend({
  	options: {
  		position: 'topleft',
  		enabled: true
  	},

  	onAdd: function (map) {
  		var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-zoom-indicator');
      this._link = L.DomUtil.create('a', '', container);
      this._link.innerHTML = map.getZoom();
      map.on('zoomend', function() {
        this._link.innerHTML = map.getZoom();
      }, this);

      return container;
    }
  });

}(this, document));

var map = L.map('map', {
  center: [45,0],
  zoom: 3,
  worldCopyJump: true,
  // maxBounds: [
  //   [-85, -180],
  //   [85, 180]
  // ],
  attributionControl: false
});

map.addControl(new L.Control.ZoomIndicator());

var defs = window.GeoPackageAPI.proj4Defs;
for (var name in defs) {
  if (defs[name]) {
    window.proj4.defs(name, defs[name]);
  }
}

var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong>'
});
var arcworldmap = L.tileLayer('http://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.png', {
  attribution: 'Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
});
map.addControl(L.control.basemaps({
  basemaps: [osm, arcworldmap],
  tileX: 0,
  tileY: 0,
  tileZ: 1
}));

var geoPackage;
var tableLayers;
var imageOverlay;
var currentTile = {};
var tableInfos;
var fileName;

var saveByteArray = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    return function (data, name) {
        var blob = new Blob(data, {type: "octet/stream"}),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = name;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

window.saveGeoPackage = function() {
  geoPackage.export(function(err, data) {
    fileName = fileName || 'geopackage.gpkg';
    saveByteArray([data.buffer], fileName.substring(0, fileName.lastIndexOf('.')) + '.gpkg');
  });
}

window.downloadGeoJSON = function(tableName) {
  GeoJSONToGeoPackage.extract(geoPackage, tableName)
  .then(function(geoJson) {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geoJson));

    var blob = new Blob([JSON.stringify(geoJson)], {type: "data:text/json;charset=utf-8"});
    FileSaver.saveAs(blob, tableName + '.geojson');
  });
}

function handleGeoJSONByteArray(array, geoJsonDoneCallback) {
  if (window.Piwik) {
    Piwik.getAsyncTracker().trackEvent(
      'GeoJSON',
      'load',
      'File Size',
      array.byteLength
    );
  }
  ga('send', {
    hitType: 'event',
    eventCategory: 'GeoJSON',
    eventAction: 'load',
    eventLabel: 'File Size',
    eventValue: array.byteLength
  });
  var jsonString = '';
  var len = array.byteLength;
  for (var i = 0; i < len; i++) {
    jsonString += String.fromCharCode( array[ i ] );
  }
  var json = JSON.parse(jsonString);
  GeoJSONToGeoPackage.convert({
    geojson:json
  }, function(status) {
    var text = status.status;
    if (status.completed) {
      text += ' - ' + ((status.completed / status.total) * 100).toFixed(2) + ' (' + status.completed + ' of ' + status.total + ')';
    }
    $('#status').text(text);
    return new Promise(function(resolve, reject) {
      setTimeout(function() {resolve();}, 0);
    })
  })
  .then(function(gp) {
    geoPackage = gp;
    clearInfo();
    readGeoPackage();
    geoJsonDoneCallback ? geoJsonDoneCallback() : null;
  });
}

function handleShapefileZipByteArray(array, shapefileZipDoneCallback) {
  if (window.Piwik) {
    Piwik.getAsyncTracker().trackEvent(
      'Shapefile Zip',
      'load',
      'File Size',
      array.byteLength
    );
  }
  ga('send', {
    hitType: 'event',
    eventCategory: 'Shapefile Zip',
    eventAction: 'load',
    eventLabel: 'File Size',
    eventValue: array.byteLength
  });
  ShapefileToGeoPackage.convert({
    shapezipData: array
  }, function(status) {
    var text = status.status;
    if (status.completed) {
      text += ' - ' + ((status.completed / status.total) * 100).toFixed(2) + ' (' + status.completed + ' of ' + status.total + ')';
    }
    $('#status').text(text);
    return Promise.resolve();
  })
  .then(function(gp) {
    geoPackage = gp;
    clearInfo();
    readGeoPackage();
    shapefileZipDoneCallback ? shapefileZipDoneCallback() : null;
  });
}

window.loadGeoPackage = function(files) {
  var f = files[0];
  fileName = f.name;
  $('#choose-label').find('i').toggle();
  $('#choose-label').find('span').text(f.name);
  $('#status').removeClass('gone');

  var r = new FileReader();
  r.onload = function() {
    var array = new Uint8Array(r.result);

    // if it is a GeoPackage file
    if (f.name.lastIndexOf('gpkg') === f.name.lastIndexOf('.')+1) {
      if (window.Piwik) {
        Piwik.getAsyncTracker().trackEvent(
          'GeoPackage',
          'load',
          'File Size',
          array.byteLength
        );
      }
      ga('send', {
        hitType: 'event',
        eventCategory: 'GeoPackage',
        eventAction: 'load',
        eventLabel: 'File Size',
        eventValue: array.byteLength
      });
      loadByteArray(array, function() {
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
      });
    }
    // if it is a GeoJSON file
    else if (f.name.lastIndexOf('json') > f.name.lastIndexOf('.')) {
      handleGeoJSONByteArray(array, function() {
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
        $('#status').addClass('gone');
      });
    }
    // if it is a Shapefile zip
    else if (f.name.lastIndexOf('zip') > f.name.lastIndexOf('.')) {
      handleShapefileZipByteArray(array, function() {
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
        $('#status').addClass('gone');
      });
    }
    // if it is a Shapefile shp
    else if (f.name.lastIndexOf('shp') > f.name.lastIndexOf('.')) {
      if (window.Piwik) {
        Piwik.getAsyncTracker().trackEvent(
          'Shapefile',
          'load',
          'File Size',
          array.byteLength
        );
      }
      ga('send', {
        hitType: 'event',
        eventCategory: 'Shapefile',
        eventAction: 'load',
        eventLabel: 'File Size',
        eventValue: array.byteLength
      });
      ShapefileToGeoPackage.convert({
        shapeData: array
      }, function(status, callback) {
        var text = status.status;
        if (status.completed) {
          text += ' - ' + ((status.completed / status.total) * 100).toFixed(2) + ' (' + status.completed + ' of ' + status.total + ')';
        }
        $('#status').text(text);
        setTimeout(callback, 0);
      }, function(err, gp) {
        geoPackage = gp;
        clearInfo();
        readGeoPackage();
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
        $('#status').addClass('gone');
      });
    }
    // if it is a MBTiles file
    else if (f.name.lastIndexOf('mbtiles') > f.name.lastIndexOf('.')) {
      if (window.Piwik) {
        Piwik.getAsyncTracker().trackEvent(
          'MBTiles',
          'load',
          'File Size',
          array.byteLength
        );
      }
      ga('send', {
        hitType: 'event',
        eventCategory: 'MBTiles',
        eventAction: 'load',
        eventLabel: 'File Size',
        eventValue: array.byteLength
      });
      MBTilesToGeoPackage.convert({
        mbtilesData: array
      }, function(status, callback) {
        var text = status.status;
        if (status.completed) {
          text += ' - ' + ((status.completed / status.total) * 100).toFixed(2) + ' (' + status.completed + ' of ' + status.total + ')';
        }
        $('#status').text(text);
        setTimeout(callback, 0);
      }, function(err, gp) {
        geoPackage = gp;
        clearInfo();
        readGeoPackage();
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
        $('#status').addClass('gone');
      });
    }
    // if it is a PBF file
    else if (f.name.lastIndexOf('pbf') > f.name.lastIndexOf('.')) {
      if (window.Piwik) {
        Piwik.getAsyncTracker().trackEvent(
          'PBF',
          'load',
          'File Size',
          array.byteLength
        );
      }
      ga('send', {
        hitType: 'event',
        eventCategory: 'PBF',
        eventAction: 'load',
        eventLabel: 'File Size',
        eventValue: array.byteLength
      });
      PBFToGeoPackage.convert({
        pbf: array
      }, function(status, callback) {
        var text = status.status;
        if (status.completed) {
          text += ' - ' + ((status.completed / status.total) * 100).toFixed(2) + ' (' + status.completed + ' of ' + status.total + ')';
        }
        $('#status').text(text);
        setTimeout(callback, 0);
      }, function(err, gp) {
        geoPackage = gp;
        clearInfo();
        readGeoPackage();
        $('#choose-label').find('i').toggle();
        $('#download').removeClass('gone');
        $('#status').addClass('gone');
      });
    }
  }
  r.readAsArrayBuffer(f);
}

function clearInfo() {
  var tileTableNode = $('#tile-tables');
  tileTableNode.empty();
  var featureTableNode = $('#feature-tables');
  featureTableNode.empty();

  for (layerName in tableLayers) {
    map.removeLayer(tableLayers[layerName]);
  }
  tableLayers = {};
  if (imageOverlay) {
    map.removeLayer(imageOverlay);
  }
  $('#information').removeClass('hidden').addClass('visible');
}

function loadByteArray(array, callback) {
  clearInfo();

  return GeoPackageAPI.open(array)
  .then(function(gp) {
    geoPackage = gp;
    readGeoPackage(gp);
  });
}

function readGeoPackage(geoPackage) {
  tableInfos = {};
  var featureTableTemplate = $('#feature-table-template').html();
  Mustache.parse(featureTableTemplate);

  var tileTableTemplate = $('#tile-table-template').html();
  Mustache.parse(tileTableTemplate);

  var tileTableNode = $('#tile-tables');
  var featureTableNode = $('#feature-tables');

  var tileTables = geoPackage.getTileTables();
  tileTables.forEach(function(table) {
    var tileDao = geoPackage.getTileDao(table);
    var info = geoPackage.getInfoForTable(tileDao);
    tableInfos[table] = info;
    var rendered = Mustache.render(tileTableTemplate, info);
    tileTableNode.append(rendered);
  });
  var featureTables = geoPackage.getFeatureTables();
  featureTables.forEach(function(table) {
    var featureDao = geoPackage.getFeatureDao(table);
    var info = geoPackage.getInfoForTable(featureDao);
    tableInfos[table] = info;
    var rendered = Mustache.render(featureTableTemplate, info);
    featureTableNode.append(rendered);
  });
}

window.zoomTo = function(minX, minY, maxX, maxY, projection) {
  try {
    var sw = proj4(projection, 'EPSG:4326', [minX, minY]);
    var ne = proj4(projection, 'EPSG:4326', [maxX, maxY]);
    map.fitBounds([[sw[1], sw[0]], [ne[1], ne[0]]]);
  } catch (e) {
    map.fitBounds([[minY, minX], [maxY, maxX]]);
  }
}

window.toggleLayer = function(layerType, table) {
  if (tableLayers[table]) {
    map.removeLayer(tableLayers[table]);
    delete tableLayers[table];
    return;
  }

  if (layerType === 'tile') {
    if (window.Piwik) {
      Piwik.getAsyncTracker().trackEvent(
        'Layer',
        'load',
        'Tile Layer'
      );
    }
    ga('send', {
      hitType: 'event',
      eventCategory: 'Layer',
      eventAction: 'load',
      eventLabel: 'Tile Layer'
    });
    var tileDao = geoPackage.getTileDao(table);
    // these are not the correct zooms for the map.  Need to convert the GP zooms to leaflet zooms
    var maxZoom = tileDao.maxWebMapZoom;
    var minZoom = tileDao.minWebMapZoom;
    var tableLayer = new L.GridLayer({noWrap: true, minZoom: minZoom, maxZoom: maxZoom});
    tableLayer.createTile = function(tilePoint, done) {
      var canvas = L.DomUtil.create('canvas', 'leaflet-tile');
      var size = this.getTileSize();
      canvas.width = size.x;
      canvas.height = size.y;
      setTimeout(function() {
        console.time('Draw tile ' + tilePoint.x + ', ' + tilePoint.y + ' zoom: ' + tilePoint.z);
        GeoPackageAPI.drawXYZTileInCanvas(geoPackage, table, tilePoint.x, tilePoint.y, tilePoint.z, size.x, size.y, canvas)
        .then(function() {
          console.timeEnd('Draw tile ' + tilePoint.x + ', ' + tilePoint.y + ' zoom: ' + tilePoint.z);
          done(null, canvas);
        });
      }, 0);
      return canvas;
    }
    map.addLayer(tableLayer);
    tableLayer.bringToFront();
    tableLayers[table] = tableLayer;
  } else if (layerType === 'feature') {
    if (window.Piwik) {
      Piwik.getAsyncTracker().trackEvent(
        'Layer',
        'load',
        'Feature Layer'
      );
    }
    ga('send', {
      hitType: 'event',
      eventCategory: 'Layer',
      eventAction: 'load',
      eventLabel: 'Feature Layer'
    });

    var tableInfo = tableInfos[table];

    geoPackage.indexFeatureTable(table, function(message) {
      $('#status-'+table).find('span').html(message);
    })
    .then(function(indexed) {
      var styles = {};
      styles[table] = {
        weight: 2,
        radius: 3
      };

      var vectorLayer = L.vectorGrid.protobuf('',{
        maxNativeZoom: 18,
        vectorTileLayerStyles: styles,
        interactive: true,
        rendererFactory: L.canvas.tile,
        getFeatureId: function(feature) {
          feature.properties.id = table + feature.id;
          return feature.properties.id;
        }
      })
      .bindPopup(function(feature) {
        var columnMap = tableInfos[table].columnMap;
        var string = "";
        if (feature.properties.name || feature.properties.description) {
            string += feature.properties.name ? '<div class="item"><span class="label">' +feature.properties.name : '</span></div>';
            string += feature.properties.description ? feature.properties.description : '';
        } else {
          for (var key in feature.properties) {
            if (columnMap && columnMap[key] && columnMap[key].displayName) {
              string += '<div class="item"><span class="label">' + columnMap[key].displayName + ': </span>';
            } else {
              string += '<div class="item"><span class="label">' + key + ': </span>';
            }
            string += '<span class="value">' + feature.properties[key] + '</span></div>';
          }
        }
        return string;
      });

      vectorLayer._getVectorTilePromise = function(coords, tileBounds) {
        return getTile(coords, tileBounds, table);
      }
      vectorLayer.addTo(map);
      vectorLayer.bringToFront();
      tableLayers[table] = vectorLayer;
    });
  }
}

function getTile(coords, tileBounds, table) {
  var x = coords.x;
  var y = coords.y;
  var z = coords.z;
  return GeoPackageAPI.getVectorTile(geoPackage, table, x, y, z)
  .then(function(json) {
    // Normalize feature getters into actual instanced features
    for (var layerName in json.layers) {
      var feats = [];

      for (var i=0; i<json.layers[layerName].length; i++) {
        var feat = json.layers[layerName].feature(i);
        feat.geometry = feat.loadGeometry();
        feats.push(feat);
      }

      json.layers[layerName].features = feats;
    }

    return json;
  });
}

function addRowToLayer(iterator, row, featureDao, srs, layer) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      var currentRow = featureDao.getFeatureRow(row);
      var json = GeoPackageAPI.parseFeatureRowIntoGeoJSON(currentRow, srs);
      layer.addData(json);
      resolve(json);
    });
  }).then(function() {
    var nextRow = iterator.next();
    if (!nextRow.done) {
      return addRowToLayer(iterator, nextRow.value, featureDao, srs, layer);
    }
  });
}

function pointToLayer(feature, latlng) {
  // just key off of marker-symbol, otherwise create a circle marker
  if (feature.properties.hasOwnProperty('marker-symbol')) {
    return L.marker(latlng, {
      icon: L.icon.mapkey(pointStyle(feature))
    });
  }
  return L.circleMarker(latlng, pointStyle(feature));
}

function pointStyle(feature) {
  var radius = 2;
  var size = 26;
  if (feature.properties['marker-size']) {
    switch(feature.properties['marker-size']) {
      case 'small':
        radius = 2;
        size = 26;
        break;
      case 'medium':
        radius = 4;
        size = 32;
        break;
      case 'large':
        radius = 6;
        size = 38;
        break;
    }
  }
  return {
    icon: feature.properties['marker-symbol'] && feature.properties['marker-symbol'] !== "" ? feature.properties['marker-symbol'] : feature.properties['type'],
    background: feature.properties['marker-color'] || "#00F",
    weight: feature.properties['stroke-width'] ? Number(feature.properties['stroke-width']) : 2,
    opacity: feature.properties['stroke-opacity'] ? Number(feature.properties['stroke-opacity']) : 1,
    size: size,
    radius: radius
  };
}

function featureStyle(feature) {
  return {
    weight: feature.properties['stroke-width'] ? Number(feature.properties['stroke-width']) : 2,
    opacity: feature.properties['stroke-opacity'] ? Number(feature.properties['stroke-opacity']) : 1,
    fillColor: feature.properties['fill'] || "#00F",
    fillOpacity: feature.properties['fill-opacity'] ? Number(feature.properties['fill-opacity']) : .2,
    color: feature.properties['stroke'] || '#00F'
  };
}

window.loadUrl = function(url, loadingElement, gpName, type) {
  if (window.Piwik) {
    Piwik.getAsyncTracker().trackEvent(
      'URL',
      'load'
    );
  }
  ga('send', {
    hitType: 'event',
    eventCategory: 'URL',
    eventAction: 'load'
  });
  fileName = url.split('/').pop();
  loadingElement.toggle();

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';

  $('#choose-label').find('span').text(gpName);
  $('#choose-label').find('i').toggle();
  xhr.onload = function(e) {
    var uInt8Array = new Uint8Array(this.response);
    switch (type) {
      case 'data':
        // this case we have to try to determine what kind of thing it is
      break;
      case 'geojson':
        handleGeoJSONByteArray(uInt8Array, function() {
          $('#download').removeClass('gone');
          $('#choose-label').find('i').toggle();
          loadingElement.toggle();
          loadRequestedLayers();
        });
        break;
      case 'mbtiles':

      break;
      case 'shapefile':
      case 'shapefilezip':
        handleShapefileZipByteArray(uInt8Array, function(err) {
          if (!err) {
            $('#download').removeClass('gone');
            $('#choose-label').find('i').toggle();
            loadingElement.toggle();
            return loadRequestedLayers();
          }
          // could be a regular shapefile
        });
        break;
      case 'gpkg':
      default:
        loadByteArray(uInt8Array)
        .then(function() {
          $('#download').removeClass('gone');
          $('#choose-label').find('i').toggle();
          loadingElement.toggle();
          loadRequestedLayers();
        });
        break;
    }
  };
  xhr.send();
}

function loadRequestedLayers() {
  var urlString = window.location.href;
  var url = new URL(urlString);
  var layersToLoad = url.searchParams.getAll("layers");
  if (layersToLoad) {
    for (var i = 0; i < layersToLoad.length; i++) {
      if (window.Piwik) {
        Piwik.getAsyncTracker().trackEvent(
          'Layer Provided In URL',
          'load'
        );
      }
      $('input[name="onoffswitch-'+layersToLoad[i]+'"]').trigger('click');
    }
  }
  var layerToZoomTo = url.searchParams.get('zoomLayer');
  if (layerToZoomTo) {
    $('#zoom-'+layerToZoomTo).trigger('click');
  }
}

window.onload = function() {
  var urlString = window.location.href;
  var url = new URL(urlString);

  var urlToLoad = determineUrlAndType();

  if (urlToLoad) {
    if (window.Piwik) {
      Piwik.getAsyncTracker().trackEvent(
        'File Provided In URL',
        'load'
      );
    }
    $('#loadFromUrl').toggle();
    $('#loadFromUrl').find('span').html(urlToLoad);
    window.loadUrl(urlToLoad.url, $('#loadFromUrl').find('i'), urlToLoad.url, urlToLoad.type);
  }
}

function determineUrlAndType() {
  var urlString = window.location.href;
  var url = new URL(urlString);
  var types = ['data', 'gpkg', 'shapefile', 'shapefilezip', 'mbtiles', 'geojson'];

  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    var urlToLoad = url.searchParams.get(types[i]);
    if (urlToLoad) {
      return {
        url: urlToLoad,
        type: type
      };
    }
  }
}

window.loadZooms = function(tableName, tilesElement) {
  var zoomsTemplate = $('#tile-zoom-levels-template').html();
  Mustache.parse(zoomsTemplate);

  var tileDao = geoPackage.getTileDao(tableName);
  var zooms = [];
  for (var i = tileDao.minZoom; i <= tileDao.maxZoom; i++) {
    zooms.push({zoom: i, tableName: tableName});
  }
  var zoomLevels = {
    zooms: zooms
  };
  var rendered = Mustache.render(zoomsTemplate, zoomLevels);
  tilesElement.empty();
  tilesElement.append(rendered);
}

var visibleTileTables = {};

window.zoomMap = function(zoom) {
  map.setZoom(zoom);
}

window.registerTileTable = function(tableName, tilesElement) {
  visibleTileTables[tableName] = tilesElement;
  loadTiles(tableName, map.getZoom(), tilesElement);
}

window.unregisterTileTable = function(tableName) {
  delete visibleTileTables[tableName];
}

map.on('moveend', function() {
  for (var table in visibleTileTables) {
    window.loadTiles(table, map.getZoom(), visibleTileTables[table]);
  }
});

window.loadTiles = function(tableName, zoom, tilesElement) {
  var mapBounds = map.getBounds();
  if (imageOverlay) map.removeLayer(imageOverlay);
  currentTile = {};

  var tilesTableTemplate = $('#all-tiles-template').html();
  Mustache.parse(tilesTableTemplate);

  var tiles = GeoPackageAPI.getTilesInBoundingBoxWebZoom(geoPackage, tableName, zoom, Math.max(-180, mapBounds.getWest()), Math.min(mapBounds.getEast(), 180), mapBounds.getSouth(), mapBounds.getNorth());
  if (!tiles || !tiles.tiles || !tiles.tiles.length) {
    tilesElement.empty();
    tilesElement.html('<div class="section-title">No tiles exist in the GeoPackage for the current bounds and zoom level</div>')
    return;
  }
  var rendered = Mustache.render(tilesTableTemplate, tiles);
  tilesElement.empty();
  tilesElement.append(rendered);
}

window.zoomToTile = function(tileColumn, tileRow, zoom, minLongitude, minLatitude, maxLongitude, maxLatitude, projection, tableName) {
  if (imageOverlay) map.removeLayer(imageOverlay);
  if (tileColumn === currentTile.tileColumn
  && tileRow === currentTile.tileRow
  && zoom === currentTile.zoom
  && tableName === currentTile.tableName) {
    currentTile = {};
    return;
  }
  var sw = proj4(projection, 'EPSG:4326', [minLongitude, minLatitude]);
  var ne = proj4(projection, 'EPSG:4326', [maxLongitude, maxLatitude]);

  var tile = GeoPackageAPI.getTileFromTable(geoPackage, tableName, zoom, tileRow, tileColumn);
  var tileData = tile.getTileData();
  var type = fileType(tileData);
  var binary = '';
  var bytes = tileData;
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode( bytes[ i ] );
  }
  var base64Data = btoa( binary );
  var url = 'data:'+type.mime+';base64,' + base64Data;
  imageOverlay = L.imageOverlay(url, [[sw[1], sw[0]], [ne[1], ne[0]]]);
  currentTile.tileColumn = tileColumn;
  currentTile.tileRow = tileRow;
  currentTile.zoom = zoom;
  currentTile.tableName = tableName;
  imageOverlay.addTo(map);
}

window.highlightTile = function(minLongitude, minLatitude, maxLongitude, maxLatitude, projection) {

  var sw = proj4(projection, 'EPSG:4326', [minLongitude, minLatitude]);
  var ne = proj4(projection, 'EPSG:4326', [maxLongitude, maxLatitude]);
  var poly =  {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [[sw[0], sw[1]],
        [sw[0], ne[1]],
        [ne[0], ne[1]],
        [ne[0], sw[1]],
        [sw[0], sw[1]]]
      ]
    }
  };

  highlightLayer.clearLayers();
  highlightLayer.addData(poly);
  highlightLayer.bringToFront();
}

window.loadFeatures = function(tableName, featuresElement) {
  var featuresTableTemplate = $('#all-features-template').html();
  Mustache.parse(featuresTableTemplate);

  var featureTemplate = $('#feature-template').html();
  Mustache.parse(featureTemplate);

  featuresElement.empty();

  var features = {
    columns: tableInfos[tableName].columns,
    srs: tableInfos[tableName].srs,
    geometryColumns: tableInfos[tableName].geometryColumns,
    tableName: tableName,
    features: []
  };
  var sanitizedColumns = [];
  for (var i = 0; i < features.columns.length; i++) {
    if (features.columns[i].name.toLowerCase() != '_properties_id' && features.columns[i].name.toLowerCase() != '_feature_id') {
      sanitizedColumns.push(features.columns[i]);
    }
  }
  features.columns = sanitizedColumns;
  featuresElement.append(Mustache.render(featuresTableTemplate, features));

  var featuresTable = featuresElement.find('#'+tableName+'-feature-table');

  var each = GeoPackageAPI.iterateGeoJSONFeaturesFromTable(geoPackage, tableName);
  var promise = Promise.resolve();
  for (var row of each.results) {
    var feature = row;
    feature.tableName = tableName;
    feature.values = [];

    for (var i = 0; i < features.columns.length; i++) {
      var value = feature.properties[features.columns[i].name];

      if (features.columns[i].displayName) {
        value = feature.properties[features.columns[i].displayName];
      }

      if (features.columns[i].name == features.geometryColumns.geometryColumn) {
        if (feature.geometry) {
          feature.values.push(feature.geometry.type);
        } else {
          feature.values.push('Unknown');
        }
      } else if (features.columns[i].name === 'id') {
        feature.values.push(feature.id);
      } else if (value === null || value === 'null' || value == undefined) {
        feature.values.push('');
      } else {
        feature.values.push(value.toString());
      }
    }
    featuresTable.append(Mustache.render(featureTemplate, feature));
  }
  return features;
}

var highlightLayer = L.geoJson([], {
    style: function (feature) {
        return {
          color: "#F00",
          weight: 3,
          opacity: 1
        };
    },
    onEachFeature: function (feature, layer) {
      var string = "";
      for (var key in feature.properties) {
        var columnMap = tableInfos[feature.properties.tableName].columnMap;
        var string = "";
        if (feature.properties.name || feature.properties.description) {
            string += feature.properties.name ? '<div class="item"><span class="label">' +feature.properties.name : '</span></div>';
            string += feature.properties.description ? feature.properties.description : '';
        } else {
          for (var key in feature.properties) {
            if (columnMap && columnMap[key] && columnMap[key].displayName) {
              string += '<div class="item"><span class="label">' + columnMap[key].displayName + ': </span>';
            } else {
              string += '<div class="item"><span class="label">' + key + ': </span>';
            }
            string += '<span class="value">' + feature.properties[key] + '</span></div>';
          }
        }
      }
      layer.bindPopup(string);
    },
    coordsToLatLng: function(coords) {
      // if (coords[0] < 0) {
      //   coords[0] = coords[0] + 360;
      // }
      return L.GeoJSON.coordsToLatLng(coords);
    }
});
map.addLayer(highlightLayer);

window.highlightFeature = function(featureId, tableName) {

  var geoJson = GeoPackageAPI.getFeature(geoPackage, tableName, featureId)
  geoJson.properties.tableName = tableName;
  highlightLayer.clearLayers();
  highlightLayer.addData(geoJson);
  highlightLayer.bringToFront();
}

window.zoomToFeature = function(featureId, tableName) {
  window.toggleFeature(featureId, tableName, true, true);
}

var currentFeature;
var featureLayer = L.geoJson([], {
    style: function (feature) {
        return {
          color: "#8000FF",
          weight: 3,
          opacity: 1
        };
    },
    onEachFeature: function (feature, layer) {
      var string = "";
      for (var key in feature.properties) {
        var columnMap = tableInfos[feature.properties.tableName].columnMap;
        var string = "";
        if (feature.properties.name || feature.properties.description) {
            string += feature.properties.name ? '<div class="item"><span class="label">' +feature.properties.name : '</span></div>';
            string += feature.properties.description ? feature.properties.description : '';
        } else {
          for (var key in feature.properties) {
            if (key == 'tableName') continue;
            if (columnMap && columnMap[key] && columnMap[key].displayName) {
              string += '<div class="item"><span class="label">' + columnMap[key].displayName + ': </span>';
            } else {
              string += '<div class="item"><span class="label">' + key + ': </span>';
            }
            string += '<span class="value">' + feature.properties[key] + '</span></div>';
          }
        }
      }
      layer.bindPopup(string);
    },
    coordsToLatLng: function(coords) {
      // if (coords[0] < 0) {
      //   coords[0] = coords[0] + 360;
      // }
      return L.GeoJSON.coordsToLatLng(coords);
    }
});
map.addLayer(featureLayer);

window.toggleFeature = function(featureId, tableName, zoom, force) {
  featureLayer.clearLayers();

  if (currentFeature === featureId && !force) {
    currentFeature = undefined;
    return;
  }

  currentFeature = featureId;

  var geoJson = GeoPackageAPI.getFeature(geoPackage, tableName, featureId);
  geoJson.properties.tableName = tableName;
  featureLayer.addData(geoJson);
  featureLayer.bringToFront();
  if (zoom) {
    map.fitBounds(featureLayer.getBounds());
  }
}

window.clearHighlights = function() {
  highlightLayer.clearLayers();
}
