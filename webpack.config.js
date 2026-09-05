'use strict';

const webpack                       = require('webpack');
const path                          = require('path');

const SentryWebpackPlugin           = require('@sentry/webpack-plugin');
const TerserPlugin                  = require("terser-webpack-plugin");

module.exports = env => {
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
        },

        // Release upload is opt-in: set SENTRY_ORG and SENTRY_PROJECT (plus
        // SENTRY_URL/SENTRY_AUTH_TOKEN) to point it at your own Sentry.
        plugins: sentryPlugins(env)
    };
};

function sentryPlugins(env)
{
    if(!env.SENTRY_ORG || !env.SENTRY_PROJECT || !env.SENTRY_AUTH_TOKEN)
    {
        return [];
    }

    return [
        // Send new release to Sentry
        new SentryWebpackPlugin({
            // sentry-cli configuration
            url: env.SENTRY_URL,
            authToken: env.SENTRY_AUTH_TOKEN,
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,

            // webpack specific configuration
            validate: true,
            include: path.resolve(__dirname, 'build'),
            ignore: ['node_modules', 'webpack.config.js']
        })
    ];
}