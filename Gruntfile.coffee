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

  
  # --------------------
  # Load task
  grunt.loadNpmTasks "grunt-contrib-jshint"
  grunt.loadNpmTasks "grunt-contrib-copy"
  grunt.loadNpmTasks "grunt-contrib-clean"
  grunt.loadNpmTasks "grunt-contrib-watch"
  grunt.loadNpmTasks "grunt-crx"
  grunt.loadNpmTasks 'grunt-browserify'
  grunt.loadNpmTasks 'grunt-bumpup'

  grunt.initConfig
  
    pkg: grunt.file.readJSON('package.json')
    manifest: grunt.file.readJSON('src/manifest.json')

    clean: [BUILD, DIST]

    jshint:
      options:
        undef: true
        unused: false
        globals: globals

      files: '**/*.js'

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
          }
        ]
    crx:
      main:
        src: ["#{BUILD}/**"]
        dest: DIST
        baseURL: "http://localhost:8777/" # clueless default
        privateKey: 'key.pem'

  grunt.registerTask "generateCrx", ['bumpup:patch', 'crx:main']

  
  grunt.registerTask "default", ['clean', 'browserify:dist', 'copy', 'generateCrx']
  grunt.registerTask "dev", ['clean', 'browserify:dev', 'copy', 'generateCrx', 'watch']
  return
