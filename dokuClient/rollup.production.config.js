import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';


// This rollup config ist used for creating production bundles

export default {
  format: 'iife',
  plugins: [

    babel(),
    resolve({
      module: true,
      jsnext: true,
      main: true,
      browser: true
     }),
     commonjs()


  ],
  entry: 'src/main-app.js',
  dest: 'build/main-app.bundle.js'
};
