# Preserve manually authored YAML during graphical edits

Graphical and structured operations will preserve comments, object ordering, and unknown extension data in a Project Document wherever they are not directly changed. The editor will update the YAML syntax tree rather than regenerate the entire document from its semantic model, making manual authorship and third-party extensions durable rather than fragile.
