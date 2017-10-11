import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';

export default {
  format: 'iife',
  plugins: [
    babel()
  ],
  entry: 'src/main-app.js',
  dest: 'src/main-app.bundle.js'
};
