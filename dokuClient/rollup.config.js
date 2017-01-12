import babel from 'rollup-plugin-babel';


export default {
  plugins: [babel()],
  entry: 'src/main-app.js',
  dest: 'src/main-app-bundle.js'
};
