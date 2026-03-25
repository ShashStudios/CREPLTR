"use client";

import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

interface LatLng {
  lat: number;
  lng: number;
}

interface SiteMapInnerProps {
  lat: number;
  lng: number;
  geometry: LatLng[];
}

function SiteMapInner({ lat, lng, geometry }: SiteMapInnerProps) {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    // Draw polygon if we have enough points
    if (geometry.length >= 3) {
      polygonRef.current = new google.maps.Polygon({
        paths: geometry,
        strokeColor: "#22c55e",
        strokeWeight: 2,
        fillColor: "rgba(34,197,94,0.2)",
        fillOpacity: 1,
        map,
      });
    }

    // Place marker at center
    markerRef.current = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#22c55e",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    });

    return () => {
      polygonRef.current?.setMap(null);
      markerRef.current?.setMap(null);
    };
  }, [map, lat, lng, geometry]);

  return null;
}

interface SiteMapProps {
  lat: number;
  lng: number;
  geometry: LatLng[];
}

export default function SiteMap({ lat, lng, geometry }: SiteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

  return (
    <div style={{ height: 280 }} className="w-full rounded-2xl overflow-hidden">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat, lng }}
          defaultZoom={15}
          mapTypeId="satellite"
          gestureHandling="none"
          disableDefaultUI
          style={{ width: "100%", height: "100%" }}
        >
          <SiteMapInner lat={lat} lng={lng} geometry={geometry} />
        </Map>
      </APIProvider>
    </div>
  );
}
