import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';

export default {
  plugins: [
    replace({
      ENV: JSON.stringify( process.env.dev ? 'dev' : 'production' )
    }),
    babel()
  ],
  entry: 'src/main-app.js',
  dest: 'src/main-app-bundle.js'
};
