# Confine unknown data to explicit extension maps

The core Project Document schema will reject unknown fields so misspellings and unsupported concepts fail visibly. The document and major entities may carry `extensions` maps keyed by globally unique identifiers; core behavior ignores their contents while graphical and textual edits preserve them losslessly.
