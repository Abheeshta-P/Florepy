import NavBar from "../../components/NavBar";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Florepy - AI Floor Plan to 3D Architectural Visualization" },
    {
      name: "description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI. Built for architects, designers, and real estate professionals.",
    },
    {
      name: "keywords",
      content:
        "AI floor plan, 3D architectural visualization, floor plan to 3D, architecture AI, 3D render, interior design AI, real estate visualization",
    },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Florepy" },
    {
      property: "og:title",
      content: "Florepy - AI Floor Plan to 3D Architectural Visualization",
    },
    {
      property: "og:description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI.",
    },
    { property: "og:image", content: "/og-image.png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Florepy architectural AI preview" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "Florepy - AI Floor Plan to 3D Architectural Visualization",
    },
    {
      name: "twitter:description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI.",
    },
    { name: "twitter:image", content: "/og-image.png" },
    { name: "twitter:image:alt", content: "Florepy architectural AI preview" },
  ];
}

export default function Home() {
  return <div className="home">
    <NavBar />
    <h1 className="text-white/90">ABHEE</h1>
  </div>
}
