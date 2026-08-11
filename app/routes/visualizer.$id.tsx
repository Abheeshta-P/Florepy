import { useLocation } from "react-router";

function VisualizerId() {
  const location = useLocation();
  const {intialImage, name, intialRendered} = location.state || {}
  return (
    <section>
      <h1>{name || "Untitled Project"}</h1>

      <div className="visualizer">
        {intialImage && (
          <div className="image-container">
            <h2>Source Image</h2>
            <img src={intialImage} alt="source" />
          </div>
        )}
      </div>
    </section>
  )
}

export default VisualizerId;