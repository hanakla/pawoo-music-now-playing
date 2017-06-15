const Webpack = require('webpack')
const {join} = require('path')

module.exports = {
    context: join(__dirname, 'src'),
    target: 'node',
    entry: {
        'main': './main'
    },
    output: {
        path: join(__dirname, 'dist'),
        filename: '[name].js',
    },
    resolve: {
        extensions: ['.js', '.ts'],
        modules: ['node_modules'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'awesome-typescript-loader',
                exclude: /node_modules/,
            },
        ],
    },
}
