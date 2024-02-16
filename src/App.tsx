import { useRef, useState } from "react";
import GL from "@luma.gl/constants";
import Map, { MapRef, useMap } from "react-map-gl";
// @ts-ignore
import { MapboxLayer } from "@deck.gl/mapbox";
// @ts-ignore
import { TileLayer } from "@deck.gl/geo-layers";
import { DecodedLayer } from "@vizzuality/layer-manager-layers-deckgl";
import { Layer, LayerManager } from "@vizzuality/layer-manager-react";
import PluginMapboxGl from "@vizzuality/layer-manager-plugin-mapboxgl";
import CartoProvider from "@vizzuality/layer-manager-provider-carto";

const cartoProvider = new CartoProvider();

const integratedAlerts = {
  type: "deck" as const,
  id: "test",
  deck: [
    new MapboxLayer({
      decodeFunction: `
  // First 6 bits Alpha channel used to individual alert confidence
    // First two bits (leftmost) are GLAD-L
    // Next, 3rd and 4th bits are GLAD-S2
    // Finally, 5th and 6th bits are RADD
    // Bits are either: 00 (0, no alerts), 01 (1, low conf), or 10 (2, high conf)
    // e.g. 00 10 01 00 --> no GLAD-L, high conf GLAD-S2, low conf RADD

    float agreementValue = alpha * 255.;

    float r = color.r * 255.;
    float g = color.g * 255.;
    float b = color.b * 255.;

    float day = r * 255. + g;
    float confidence = floor(b / 100.) - 1.;
    // float confidence = 255.;
    float intensity = mod(b, 100.) * 150.;
    // float intensity = 255.; //this is temporal above one does not work

    if (
      day > 0. &&
      day >= startDayIndex &&
      day <= endDayIndex &&
      agreementValue > 0.
    )
    {
      if (intensity > 255.) {
        intensity = 255.;
      }
      // get high and highest confidence alerts
      float confidenceValue = 0.;
      if (confirmedOnly > 0.) {
        confidenceValue = 255.;
      }

      if (agreementValue == 4. || agreementValue == 16. || agreementValue == 64.) {
        // ONE ALERT LOW CONF: 4,8,16,32,64,128 i.e. 2**(2+n) for n<8

        color.r = 237. / 255.;
        color.g = 164. / 255.;
        color.b = 194. / 255.;
        alpha = (intensity -confidenceValue) / 255.;
      } else if (agreementValue == 8. || agreementValue == 32. || agreementValue ==  128.){
        // ONE HIGH CONF ALERT: 8,32,128 i.e. 2**(2+n) for n<8 and odd

        color.r = 220. / 255.;
        color.g = 102. / 255.;
        color.b = 153. / 255.;
        alpha = intensity / 255.;
      } else {
        // MULTIPLE ALERTS: >0 and not 2**(2+n)

        color.r = 201. / 255.;
        color.g = 42. / 255.;
        color.b = 109. / 255.;
        alpha = intensity / 255.;
      }
    } else {
      alpha = 0.;
    }
  `,
      decodeParams: {
        startDayIndex: 2785,
        endDayIndex: 3334,
        numberOfDays: 3334,
        confirmedOnly: 0,
      },
      type: TileLayer,
      data: "https://tiles.globalforestwatch.org/gfw_integrated_alerts/latest/default/{z}/{x}/{y}.png",
      tileSize: 256,
      refinementStrategy: "no-overlap",
      visible: true,
      id: "test",
      renderSubLayers: (sl: any) => {
        const {
          id: subLayerId,
          data,
          tile,
          visible,
          opacity: _opacity,
          decodeFunction: dFunction,
          decodeParams: dParams,
        } = sl;

        const {
          z,
          bbox: { west, south, east, north },
        } = tile;

        if (data) {
          return new DecodedLayer({
            id: subLayerId,
            image: data,
            bounds: [west, south, east, north],
            textureParameters: {
              [GL.TEXTURE_MIN_FILTER]: GL.NEAREST,
              [GL.TEXTURE_MAG_FILTER]: GL.NEAREST,
              [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
              [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE,
            },
            zoom: z,
            visible,
            opacity: _opacity,
            decodeParams: dParams,
            decodeFunction: dFunction,
            updateTriggers: {
              decodeParams: dParams,
              decodeFunction: dFunction,
            },
          });
        }
        return null;
      },
      minZoom: 3,
      maxZoom: 12,
    } as any),
  ],
};
function App() {
  const [viewState, setViewState] = useState({
    longitude: -100,
    latitude: 40,
    zoom: 3.5,
  });
  const mapRef = useRef<MapRef | null>(null);

  const logs = {
    logMap: mapRef.current,
    viewState: viewState,
    layers: integratedAlerts,
  };
  return (
    <>
      <button onClick={() => console.log(logs)}>Log Map</button>
      <Map
        {...viewState}
        ref={(_map) => {
          if (_map) mapRef.current = _map.getMap() as unknown as MapRef;
        }}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{
          height: "100%",
        }}
        mapStyle="mapbox://styles/mapbox/light-v9"
        mapboxAccessToken="pk.eyJ1IjoicmVzb3VyY2V3YXRjaCIsImEiOiJjajFlcXZhNzcwMDBqMzNzMTQ0bDN6Y3U4In0.FRcIP_yusVaAy0mwAX1B8w"
      >
        {!!mapRef.current && <LayerManagerWrapper />}
      </Map>
    </>
  );
}

function LayerManagerWrapper() {
  const { current: map } = useMap();
  return map && map.getMap() ? (
    <LayerManager
      map={map.getMap()}
      plugin={PluginMapboxGl}
      providers={{
        [cartoProvider.name]: cartoProvider.handleData,
      }}
    >
      <Layer key={integratedAlerts.id} {...integratedAlerts} />
    </LayerManager>
  ) : (
    <></>
  );
}

export default App;
