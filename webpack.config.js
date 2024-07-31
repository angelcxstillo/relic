import path from "path";
import { fileURLToPath } from 'url';
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'development',
  entry: path.join(__dirname, 'index'),
  watch: true,
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/dist/',
    filename: "bundle.js",
    chunkFilename: '[name].js'
  },
  module: {
    rules: [{
      test: /.jsx?$/,
      include: [
        path.resolve(__dirname, 'lib')
      ],
      exclude: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, 'lib', 'generate.js')
      ],
      loader: 'babel-loader',
      options: {
        presets: [
          ["@babel/env", {
            "targets": {
              "browsers": "last 2 chrome versions"
            }
          }]
        ]
      }
    }]
  },
  resolve: {
    extensions: ['.json', '.js', '.jsx'],
    fallback: {
      "crypto": false,
      "fs": false,
      "path": path.resolve(__dirname, 'node_modules', "path-browserify")
    }
  },
  devtool: 'source-map',
  devServer: {
    contentBase: path.join(__dirname, '/dist/'),
    inline: true,
    host: 'localhost',
    port: 8080,
  },
  plugins: [
    new NodePolyfillPlugin()
  ]
};