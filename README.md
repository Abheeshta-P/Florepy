# Florepy

Florepy is an AI-powered architectural visualization platform that transforms two-dimensional architectural floor plans into photorealistic, top-down 3D visualizations. Built on React Router, Tailwind CSS, and Puter.js, the system provides an end-to-end design environment supporting client-side asset optimization, server boundary validation, cloud file storage, and project sharing.

## Overview

Florepy streamlines the architectural rendering workflow for designers, architects, and real estate professionals. Users can upload floor plans in common raster and vector formats, process them through automated rasterization pipelines, and generate photorealistic 3D renderings using Puter AI services.

The platform provides a dual-layer security model that validates assets on both the client interface and server boundary, ensuring data integrity before committing files to persistent storage or invoking inference pipelines.

## Key Capabilities

### Intelligent Plan Ingestion
* Supports JPG, PNG, WebP, and SVG formats up to 10 MB.
* Automated client-side vector rasterization converts transparent SVG floor plans into high-contrast, white-background PNG assets optimized for AI computer vision models.
* Drag-and-drop file handling built with native HTML5 APIs, eliminating unnecessary third-party dependencies.

### Dual-Layer Validation
* Client-side validation for instant user feedback on file types and payload boundaries.
* Server-side boundary checks verifying Base64 structure, MIME type authenticity, and true decoded byte dimensions prior to processing.
* Graceful error handling for missing files, corrupt buffers, and oversized payloads.

### Cloud Storage and Project Persistence
* Integrated with Puter.js for user authentication and decentralized cloud storage.
* Binary asset storage powered by Puter File System (`puter.fs`).
* Project metadata and status tracking managed through Puter Key-Value store (`puter.kv`).
* Configurable visibility controls supporting private internal assets and public web-hosted projects via Puter Hosting.

### Interactive Visualization Workspace
* Dedicated project visualizer interface with side-by-side and overlay comparison modes.
* Material customization options for flooring, wall treatments, and interior styling presets.
* Project sharing capabilities with granular access management.

## Architecture and Processing Pipeline

1. Ingestion: The user uploads a 2D floor plan via the browser interface.
2. Client Preprocessing: If an SVG vector plan is detected, the browser rasterizes the vector onto an HTML5 canvas with a solid white background, outputting a high-resolution PNG Data URL.
3. Boundary Validation: The payload is routed through `validateServerUploadBoundary` to confirm MIME compliance and byte constraints.
4. Storage: Validated assets are converted to binary Blobs and stored in the user's isolated Puter filesystem.
5. Inference: The processed asset is paired with architectural rendering prompts and dispatched to the Puter AI inference worker.
6. Visualization: The generated 3D render is stored, associated with project metadata in the KV store, and rendered in the comparison viewer.

## Technology Stack

* Framework: React Router v7 (Full-Stack SSR / CSR)
* Frontend Library: React 19, TypeScript
* Styling: Tailwind CSS v4
* Cloud & Authentication: Puter.js (Auth, KV Store, File System, Hosting)
* Icons & UI Utilities: Lucide React, React Compare Slider
* Bundler: Vite 8

## Getting Started

### Prerequisites
* Node.js 20.x or higher
* npm 10.x or higher

### Installation
Clone the repository and install project dependencies:

```bash
git clone https://github.com/Abheeshta-P/Florepy.git
cd Florepy
npm install
```

### Environment Configuration
Create a `.env` file in the project root to configure external worker endpoints:

```env
VITE_PUTER_WORKER_URL=https://your-puter-worker.puter.site
```

### Development Server
Start the local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The application will be accessible at `http://localhost:5173`.

### Type Checking
Run the TypeScript compiler and React Router type generator:

```bash
npm run typecheck
```

### Production Build
Compile the client assets and server bundle for production deployment:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

## Project Structure

```text
florepy/
├── app/
│   ├── routes/
│   │   ├── home.tsx              # Landing page and upload interface
│   │   └── visualizer.$id.tsx    # 3D project visualization workspace
│   ├── app.css                   # Global styles and Tailwind directives
│   ├── root.tsx                  # Root layout, HTML skeleton, and auth context
│   └── routes.ts                 # Route definitions and configuration
├── components/
│   ├── ui/
│   │   └── Button.tsx            # Standardized button components
│   ├── NavBar.tsx                # Navigation header and authentication controls
│   └── Upload.tsx                # Dropzone, validation, and rasterization component
├── lib/
│   ├── constants.ts              # System constraints, timing tokens, validation logic
│   ├── puter.action.ts           # Authentication and project management actions
│   ├── puter.hosting.ts          # Static asset hosting and subdomain deployment
│   └── utils.ts                  # Binary conversions and file format utilities
├── public/                       # Static public assets, favicons, open graph images
├── type.d.ts                     # Global TypeScript interfaces and type declarations
├── package.json                  # Dependencies and build scripts
└── vite.config.ts                # Vite and Tailwind build configuration
```

## Security and Data Integrity

* Authentication Boundaries: File operations and visualizer routes enforce sign-in checks via Puter OAuth.
* Sanitized Image Pipelines: Decoded payloads undergo strict byte and MIME checks, preventing arbitrary file injection into cloud storage.
* Granular Asset Exposure: Private project assets remain confined to authenticated filesystem paths and are not deployed to public subdomains.

> Developed and maintained by [Abheeshta P](https://github.com/Abheeshta-P).
