import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins : [react()],
    build   : {
        // The graph libraries (cytoscape + elk) are most of the bundle and
        // dwarf the default warning limit on their own.
        chunkSizeWarningLimit: 1500
    }
});
