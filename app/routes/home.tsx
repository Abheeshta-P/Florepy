import { ArrowRight, Clock, Layers } from "lucide-react";
import NavBar from "../../components/NavBar";
import type { Route } from "./+types/home";
import Button from "../../components/ui/Button";

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
  return (
    <div className="home">
      <NavBar />
      <section className="hero">
        <div className="announce">
          <div className="dot">
            <div className="pulse"></div>
          </div>
          <p>Introducing Florepy 2.0</p>
        </div>
        <h1>Build beautiful spaces at the speed of thought with Florepy</h1>
        <p className="subtitle">
          Florepy is an AI-first design enviornment that helps you visualize,
          render and ship architectural projects faster than ever.
        </p>

        <div className="actions">
          <a href="#upload" className="cta">
            Start Building <ArrowRight className="icon" />
          </a>
          <Button variant="outline" size="lg" className="demo">
            Watch Demo
          </Button>
        </div>

        <div className="upload-shell">
          <div className="grid-overlay" />
          <div className="upload-card">
            <div className="upload-head">
              <div className="upload-icon">
                <Layers className="icon" />
              </div>
              <h3>Upload your floor plan</h3>
              <p>Supports JPG, PNG, formats up to 10MB</p>
            </div>
            <p>Upload images</p>
          </div>
        </div>
      </section>

      <section className="projects">
        <div className="section-inner">
          <div className="section-head">
            <div className="copy">
              <h2>Projects</h2>
              <p>
                Your latest work and shared community projects, all in one
                place.
              </p>
            </div>
          </div>
          <div className="projects-grid">
            <div className="project-card group">
              <div className="preview">
                <img
                  src="https://roomify-mlhuk267-dfwu1i.puter.site/projects/1770803585402/rendered.png"
                  alt="Project"
                />

                <div className="badge">
                  <span>Community</span>
                </div>
              </div>
              <div className="card-body">
                <div>
                  <h3>Project Manhatann</h3>
                  <div className="meta">
                    <Clock size={12} />
                    <span>{new Date("08.25.2026").toLocaleDateString()}</span>
                    <span>By SS</span>
                  </div>
                </div>
                <div className="arrow">
                  <ArrowRight size={18}/>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
