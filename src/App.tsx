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
import {Fp64Extension} from '@deck.gl/extensions';

const cartoProvider = new CartoProvider();

const gladFunction = `
    // values for creating power scale, domain (input), and range (output)
    float confidenceValue = 0.;
    if (confirmedOnly > 0.) {
      confidenceValue = 200.;
    }
    float day = color.r * 255. * 255. + (color.g * 255.);
    float confidence = color.b * 255.;

    if (
      day > 0. &&
      day >= startDayIndex &&
      day <= endDayIndex &&
      confidence >= confidenceValue
    ) {
      // get intensity
      float intensity = mod(confidence, 100.) * 150.;
      if (intensity > 255.) {
        intensity = 255.;
      }
      if (confidence < 200.) {
        color.r = 237. / 255.;
        color.g = 164. / 255.;
        color.b = 194. / 255.;
        alpha = intensity / 255.;
      } else {
        color.r = 220. / 255.;
        color.g = 102. / 255.;
        color.b = 153. / 255.;
        alpha = intensity / 255.;
      }
    } else {
      alpha = 0.;
    }
  `;

const integratedFunction = `
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
  float intensity = mod(b, 100.) * 50.;

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
 `;

const deckLayer = ({
  decodeFunction,
  dataUrl,
}: {
  decodeFunction: string;
  dataUrl: string;
}) => ({
  type: "deck" as const,
  id: dataUrl,
  deck: [
    new MapboxLayer({
      decodeFunction: decodeFunction,
      decodeParams: {
        startDayIndex: 2785,
        endDayIndex: 3334,
        numberOfDays: 3334,
        confirmedOnly: 0,
      },
      id: "integrated",
      type: TileLayer,
      data: dataUrl,
      tileSize: 256,
      visible: true,
      refinementStrategy: "no-overlap",
      extensions: [new Fp64Extension()],
      opacity: 1,
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
});
function App() {
  const [viewState, setViewState] = useState({
    longitude: -50,
    latitude: -10,
    zoom: 6,
  });
  const integrated = {
    decodeFunction: integratedFunction,
    dataUrl:
      "https://tiles.globalforestwatch.org/gfw_integrated_alerts/latest/default/{z}/{x}/{y}.png",
  };
  const glads = {
    decodeFunction: gladFunction,
    dataUrl:
      "https://tiles.globalforestwatch.org/umd_glad_landsat_alerts/latest/default/{z}/{x}/{y}.png",
  };
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  const [alert, setAlert] = useState(deckLayer(integrated));
  const [message, setMessage] = useState("Showing integrated");

  const logs = {
    logMap: mapRef.current,
    viewState: viewState,
    layers: alert,
  };
  return (
    <>
      <span>{message}</span>
      <div>
        <button
          onClick={() => {
            setMessage("Showing integrated");
            setAlert(deckLayer(integrated));
          }}
        >
          Show integrated
        </button>
        <button
          onClick={() => {
            setMessage("Showing glads");
            setAlert(deckLayer(glads));
          }}
        >
          Show glads
        </button>
        <button onClick={() => console.log(logs)}>Log Map</button>
        <Map
          {...viewState}
          ref={(_map) => {
            if (_map) mapRef.current = _map.getMap() as unknown as MapRef;
          }}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{
            height: "800px",
          }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken="pk.eyJ1IjoicmVzb3VyY2V3YXRjaCIsImEiOiJjajFlcXZhNzcwMDBqMzNzMTQ0bDN6Y3U4In0.FRcIP_yusVaAy0mwAX1B8w"
          onLoad={() => {
            setReady(true);
          }}
        >
          {ready && <LayerManagerWrapper alert={alert} />}
        </Map>
      </div>
    </>
  );
}

function LayerManagerWrapper({ alert }: { alert: any }) {
  const { current: map } = useMap();
  return map && map.getMap() ? (
    <LayerManager
      map={map.getMap()}
      plugin={PluginMapboxGl}
      providers={{
        [cartoProvider.name]: cartoProvider.handleData,
      }}
    >
      <Layer key={alert.id} {...alert} />
    </LayerManager>
  ) : (
    <></>
  );
}

export default App;
