var gulp = require('gulp'),
  argv = require('yargs').argv,
  uglify = require('gulp-uglify'),
  rimraf = require('gulp-rimraf'),
  rename = require('gulp-rename'),
  jshint = require('gulp-jshint'),
  concat = require('gulp-concat')
  mochify = require('mochify');

gulp.task('lint', function() {
  return gulp.src('src/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('clean', function() {
  return gulp.src('dist').pipe(rimraf());
});

gulp.task('build', ['lint', 'clean'], function() {
  return gulp.src('src/*.js')
    .pipe(concat('hot_swap.js'))
    .pipe(gulp.dest('dist'))
    .pipe(rename('hot_swap.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('dist'));
});

gulp.task('test', function() {
  return mochify('./test/*.test.js', { reporter: 'spec', wd: argv['use-sauce-labs'] })
    .add('./test/helper.js')
    .bundle();
});