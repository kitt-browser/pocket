module.exports = (grunt) ->

  path = require 'path'

  # PATH where to store unzipped build
  BUILD = "build"

  # PATH where to store final zip
  DIST = "dist"

  # Common JS globals
  globals =
    document: false
    console: false
    alert: false
    chrome: false
    module: false
    process: false
    window: false
    exports: false
    require: false
    localStorage: false
    XMLHttpRequest: false


  # --------------------
  # Load task
  grunt.loadNpmTasks "grunt-contrib-jshint"
  grunt.loadNpmTasks "grunt-contrib-copy"
  grunt.loadNpmTasks "grunt-contrib-clean"
  grunt.loadNpmTasks "grunt-contrib-watch"
  grunt.loadNpmTasks "grunt-crx"
  grunt.loadNpmTasks 'grunt-browserify'
  grunt.loadNpmTasks 'grunt-bumpup'
  grunt.loadNpmTasks 'grunt-s3'

  grunt.initConfig

    pkg: grunt.file.readJSON('package.json')
    manifest: grunt.file.readJSON('src/manifest.json')

    clean: [BUILD, DIST]

    jshint:
      options:
        undef: true
        unused: false
        globals: globals

      files: 'src/js/*.js'

    bumpup:
      options:
        updateProps:
          pkg: './package.json'
          manifest: './src/manifest.json'
      files: [
        "package.json"
        "src/manifest.json"
      ]

    browserify:
      dev:
        files: [
          {src: 'src/js/bookmarkList.js', dest: "#{BUILD}/js/bookmarkList.js"}
          {src: 'src/js/auth.js', dest: "#{BUILD}/js/auth.js"}
          {src: 'src/js/main.js', dest: "#{BUILD}/js/main.js"}
          {src: 'src/js/content.js', dest: "#{BUILD}/js/content.js"}
        ]
        options:
          transform: ['cssify']
      watch:
        files: "<%= browserify.dev.files %>",
        options:
          keepAlive: yes
          watch: yes
          transform: "<%= browserify.dev.options.transform %>",
      dist:
        files: "<%= browserify.dev.files %>",
        options:
          transform: ['cssify']

    watch:
      browserify:
        files: ['src/**/*.js', 'src/**/*.css']
        tasks: ['browserify:dev', 'crx:main']
      html:
        files: ['src/**/*.html', 'src/img/**/*.*', 'src/manifest.json']
        tasks: ['copy', 'crx:main']

    copy:
      main:
        files: [{
            expand: yes
            src: ['img/**']
            cwd: 'src'
            dest: BUILD
          }, {
            expand: yes
            src: ['*.html']
            cwd: 'src'
            dest: "#{BUILD}/html"
          },{
            expand: yes
            src: 'manifest.json'
            cwd: 'src'
            dest: BUILD
          },{
            expand: yes
            src: ['fonts/*.*']
            cwd: 'node_modules/ionic-framework/release'
            dest: BUILD
          },{
          }
        ]
    crx:
      main:
        src: ["#{BUILD}/**"]
        filename: 'pocket.crx'
        dest: DIST
        baseURL: "http://localhost:8777/" # clueless default
        privateKey: 'key.pem'

    s3:
      options:
        key: process.env.S3_KEY
        secret: process.env.S3_SECRET
        bucket: process.env.S3_BUCKET
        access: 'private'
        headers:
          # Two Year cache policy (1000 * 60 * 60 * 24 * 730).
          "Cache-Control": "max-age=630720000, public",
          "Expires": new Date(Date.now() + 63072000000).toUTCString()
      dist:
        upload: [
          src: "dist/*.crx"
          dest: process.env.S3_FOLDER
        ]

  grunt.registerTask "generateCrx", ['crx:main']


  grunt.registerTask "default", ['jshint', 'clean', 'browserify:dist', 'copy', 'generateCrx']
  grunt.registerTask "dev", ['jshint', 'clean', 'browserify:dev', 'copy', 'generateCrx', 'watch']

  grunt.registerTask 'upload', ->
    grunt.fail.fatal("S3_FOLDER env var not specified") unless process.env.S3_FOLDER?
    grunt.task.run ['default', 'bumpup:patch', 's3:dist']
