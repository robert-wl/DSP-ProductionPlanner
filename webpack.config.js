'use strict';

/**
 * Legacy build: bundles src/DSPCPP.js into build/DSPCPP.js, the script the
 * upstream dyson-calculator.com page loads. The Next.js app in app/ does not
 * use this - it drives src/Worker.js directly - but the bundle is kept so the
 * original embed target still builds.
 */

const path                          = require('path');

const TerserPlugin                  = require("terser-webpack-plugin");

module.exports = () => {
    return {
        mode            : 'production',
        devtool         : 'hidden-source-map',
        performance     : { hints: false },
        context         : path.resolve(__dirname, 'src'),
        entry           : {
            DSPCPP          : './DSPCPP.js'
        },

        output          : {
            path            : path.resolve(__dirname, 'build'),
            filename        : './[name].js'
        },
        optimization    : {
            minimize        : true,
            minimizer       : [
                //new TerserPlugin({test: /\.js(\?.*)?$/i})
            ]
        }
    };
};
