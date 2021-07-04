const { series, parallel, src, dest } = require('gulp');
const gulpChanged = require('gulp-changed');
const gulpInstall = require('gulp-install');
const less = require('gulp-less');
const eslint = require('gulp-eslint');
const gulpWatch = require('gulp-watch');
const babel = require('gulp-babel');
const del = require('del');
const gulpRename = require('gulp-rename');
const through2 = require('through2');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const modules = require('postcss-modules');
// const debug = require('gulp-debug');

const SOURCE = './client/**/*';
const DESTINATION = './dist/';

/**
 * @description 将需要的文件放入 dist 目录。
 */
const assembleFiles = () =>
  src([SOURCE, '!./client/**/*.less', '!./client/**/*.ts'])
    .pipe(gulpChanged(DESTINATION))
    .pipe(dest(DESTINATION));

/**
 * @description 根据package.json的运行时依赖打包到 dist 目录中，同时复制package.json文件。
 */
const buildDependencies = () =>
  src('./package.json')
    .pipe(gulpChanged(DESTINATION))
    .pipe(dest(DESTINATION))
    .pipe(
      gulpInstall({
        production: true, // 只安装运行依赖
      })
    );

/**
 * @description 删除目标文件
 * !!force高危操作，允许删除当前目录和外部目录
 */
const clean = () => del(DESTINATION, { force: true });

/**
 * @description 编译成最终的开发包
 */
const buildApp = parallel(buildDependencies, assembleFiles);

const watchOrigin = () =>
  gulpWatch(
    [SOURCE, '!./client/**/*.less', '!./client/**/*.{js,ts}'],
    {},
    assembleFiles
  );

const lint = () =>
  src('client/**/*.{js,ts}')
    .pipe(eslint({ useEslintrc: true }))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());

const lessc = () => {
  return (
    src('./client/**/*.less')
      .pipe(less())
      // 这种方式css modules个人觉得还是不优雅，新增了css.json文件来依托关系。不适应的可以不用，注释这行，直接使用less即可
      .pipe(postcss([modules(), autoprefixer()]))
      .pipe(
        gulpRename((path) => {
          path.extname = '.acss';
        })
      )
      /**
       * 在纯h5的场景下，@import的less文件修改后，引用的 less 文件也是可以正常编译的。
       *
       * 但是小程序底层是有一套webpack进行构建的，在 less 进行编译的时候，由于@import的less文件变了，引用的没有变，
       * 在 gulp.dest 里面进行 writeFile 后 updateMeta 写入的文件 mtime 和 atime 依然是旧的，
       * 从而导致 webpack 的 watchpack 基于 mtime 进行检测认为这个文件并没有变化，所以小程序就没有进行构建。
       */
      .pipe(
        through2.obj((file, enc, cb) => {
          file.stat.mtime = new Date();
          file.stat.atime = new Date();
          cb(null, file);
        })
      )
      .pipe(dest(DESTINATION))
  );
};

const js = () =>
  src('./client/**/*.{js,ts}')
    .pipe(gulpChanged(DESTINATION))
    .pipe(
      babel({
        presets: ['@babel/preset-typescript', '@babel/preset-env'],
        plugins: ['@babel/transform-runtime'],
      })
    )
    .pipe(dest(DESTINATION));

/**
 * @description 监听改动
 */
const watching = () => {
  gulpWatch('client/**/*.{js,ts}', {}, parallel(lint, js));
  // 首次需要编译
  gulpWatch('./client/**/*.less', { ignoreInitial: false }, lessc);
  watchOrigin();
};

/**
 * @description 开发脚本入口
 */
exports.dev = series(clean, buildApp, js, watching);

/**
 * @description 发布脚本入口
 * 在编译过程中不能cleanBuild会造成支付宝IDE找不到对应的文件，所以cleanBuild放在了开发中。
 * 唯一可能造成的问题是，在watching时删除的一些文件会被带上线（也不会有问题），所以最终发布
 * 前手动执行一次cleanBuild，或者重新执行一次dev即可。
 *
 * TODO：生产环境需要压缩css文件和js文件
 */
exports.build = series(clean, parallel(lessc, js), buildApp);
