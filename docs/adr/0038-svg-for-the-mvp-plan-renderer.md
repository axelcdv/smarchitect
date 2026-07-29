# Render the MVP plan with SVG

The MVP will render its single active plan as SVG for crisp zooming, addressable interactive elements, text, transforms, and near-term arc support. Hit-testing and geometric calculations remain in the shared core rather than relying on SVG DOM behavior, allowing the renderer to change later if measured scale requires it.
