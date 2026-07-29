# Share a runtime-neutral TypeScript core

Schema types, YAML round-tripping, validation, migrations, geometry, and domain operations will live in runtime-neutral TypeScript packages shared by the browser app and headless CLI. Distributed packages will emit ordinary JavaScript and declarations rather than depending on runtime execution of TypeScript source.
