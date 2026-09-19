import { createFileRoute } from "@tanstack/react-router";
import { ApexDrive } from "../components/game/ApexDrive";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Apex Drive — 3D Driving Simulator" },
      {
        name: "description",
        content:
          "Apex Drive: a browser-based 3D driving simulator with automatic, semi-automatic and full manual-with-clutch transmissions, drifting, free roam and more.",
      },
      { property: "og:title", content: "Apex Drive — 3D Driving Simulator" },
      {
        property: "og:description",
        content:
          "Drive a low-poly open world with realistic gearboxes: automatic, paddle-shift and manual with clutch. Play in your browser.",
      },
    ],
  }),
  component: ApexDrive,
});
