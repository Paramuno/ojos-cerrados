let activeBezier // active bezier bpoint object
let prevactiveBezier
let bpointArray = []
let baseArray = [] // array of base bpoint objects

let testknots = [] // 2D array of knots
let vel = .00001 // default initial velocity for interpolating to looseknot
let looseknot = true // does the knot return to loose all the time?
let loosening = true
let permissiongiven = false
let whistling = false // Is whistling detected?
let whistlingArray = [] // A buffer array to smooth out whistling signals
const minHz = 550 // defined whistling range in Hz
const maxHz = 2000
let zone2D = 0

let spectrum // fft analyze product
let spectralCentroid // centroid in Hz
let centroids = [] // A centroid buffer
let clampedhBuffer = []
let volumeBuffer = [] // A volume buffer
let clampedvBuffer = []
let chosenWordBuffer // A buffer to save the last chosen word and display it

let floaters = [] // floaters img array
let floRots = [] // array for rotations of the floaters
let seed1 = 0 // noise seeds
let seed2 = 1000
let txRwalk = 0
let tyRwalk = 0

//text variables
let iStrFound = [] //Array with the indexes of found strings

function preload() {
  loosejson = loadJSON("data/loosejson.json")
  keyWords = loadJSON("data/WordSets.json")
  for (let i = 0; i < 6; i++) { //initalizing 6 floater bois and pushing random rotations in a matching array
    floaters.push(loadImage("images/floater" + i + ".png"))
    floRots.push(random(-180, 180))
  }
  for (let i = 0; i < 10; i++) { // initialize all available knots
    testknots.push(loadJSON("data/knot" + i + ".json"))
  }
}

//Shaders variables
let gl, noctaves, c, sourceCanvas

function setup() {
  createCanvas(windowWidth, windowHeight - 4)
  texShader = createGraphics(windowWidth, windowHeight - 4, WEBGL)
  texShader1 = createGraphics(windowWidth, windowHeight - 4, WEBGL)
  sourceCanvas = createGraphics(windowWidth, windowHeight - 4) // shader 1 needs a canvas to draw pixels from, current canvas effect would be too ugly so we make an empty one
  gl = texShader.canvas.getContext('webgl')
  gl.disable(gl.DEPTH_TEST)
  noctaves = 5 // noise octaves def5
  c = []
  for (var i = 0; i < 22; i++) {
    c[i] = random(-5, 5); // blob matrix
  }
  hyp = new p5.Shader(texShader._renderer, vert, frag) // Using live shader (fluid colors)
  texShader.shader(hyp) // loading shader into Graphics buffer
  texShader.noStroke()
  ///
  hyp1 = new p5.Shader(texShader1.renderer, vert1, frag1) // Using the 2nd live shader (blurry lights)
  texShader1.noStroke()
  sourceCanvas.background(0)
  ///
  angleMode(DEGREES) // for the floaters rotations
  getAudioContext().suspend()
  noStroke()
  let cw = (width / 2),
    ch = (height / 2)
  bpointArray.push(new Bpoint(true, createVector(cw, ch - 50), createVector(cw, ch - 50), createVector(cw - 75, ch - 50), 0))
  bpointArray.push(new Bpoint(true, createVector(cw, ch + 50), createVector(cw - 75, ch + 50), createVector(cw, ch + 50), 1))
  bpointArray.push(new Bpoint(true, createVector(cw, ch + 50), createVector(cw, ch + 50), createVector(cw + 75, ch + 50), 2))
  bpointArray.push(new Bpoint(true, createVector(cw, ch - 50), createVector(cw + 75, ch - 50), createVector(cw, ch - 50), 3))

  for (let b of bpointArray) {
    if (b.isBase) baseArray.push(b)
  }
  sound = new p5.AudioIn()
  sound.start()
  fft = new p5.FFT()
  sound.connect(fft)
  sound.amp(.05)
  fft.smooth()
  for (let i = 0; i < 12; i++) { // 20 frames of non whistling won't stop whistlingswitch
    whistlingArray.push(0)
  }
  for (let i = 0; i < 21; i++) { // making a 20 frame buffer for centroids
    centroids.push(0)
  }
  for (let i = 0; i < 10; i++) { // making a 10 frame buffer for clamping centroids
    clampedhBuffer.push(0)
  }
  for (let i = 0; i < 31; i++) { // making a 31 frame buffer for pastvolumes
    volumeBuffer.push(0)
  }
  for (let i = 0; i < 20; i++) { // making a 10 frame buffer for clamping pastvolumes
    clampedvBuffer.push(0)
  }
  spectralCentroid = 600 // initializing variable to pass to shader before sound is fftanalyzed
  init24knots() // initializing all knots for immediate functionality

  // Volume and Hz sliders
  // volS = createSlider(0, 500, 0, 0)
  // volS.position(10, 10, 0, 0)
  // volS.style('width', '800px')
  // hzS = createSlider(0, 500, 0, 0)
  // hzS.position(10, 50, 0, 0)
  // hzS.style('width', '800px')
  //console.clear()
}

function init24knots() {
  let cw = (width / 2)
  let ch = (height / 2)
  prevactiveBezier = bpointArray[1]
  activeBezier = bpointArray[2]
  for (let i = 0; i < 10; i++) {
    bpointArray.splice(prevactiveBezier.index + 1, 0, new Bpoint(false, createVector(cw - 0, ch + 50),
      createVector(cw - 0, ch + 50), createVector(cw - 0, ch + 50), i + activeBezier.index))
    bpointArray.push(new Bpoint(false, createVector(cw - 0, ch - 50), createVector(cw - 0, ch - 50),
      createVector(cw - 0, ch - 50), bpointArray.length))
  }
  for (let i = 0; i < bpointArray.length; i++) { //updatinng indexes
    bpointArray[i].index = i
  }
  //print("current Bpoints:" + bpointArray.length)
}

function draw() {
  if (getAudioContext().state !== 'running') { // If audio context is running
    drawTitle()
  } else {
    (height < (width * 1.4)) ? drawShader(): background(38, 29, 29)
    imageMode(CENTER)
    for (let i = 0; i < floaters.length; i++) { //drawing all floaters in the array
      drawFloaters(floaters[i], i * 100, i) //passing floaterimg noiseseed and index
    }
    drawBezier()
    drawAttractor()
    for (let w of whistlingArray) { // Checking if there's any whistling in the buffer
      if (w > 0) whistling = true
    }
    whistlingArray.push(0) // cleaning Buffer
    whistlingArray.shift()
    if (height < (width * 1.4)) drawShader1()
    if (whistling && !loosening) {
      spectrum = fft.analyze()
      spectralCentroid = fft.getCentroid()
      fill(255)
      textSize(15)
      sqInterpolatebpointArray2D(testknots)
      drawKeywords2D(true, floor(random(keyWords[zone2D].s.length)))
      whistling = false // reset whistling
    } else if (looseknot) { // if lknot active
      interpolatetoLooseKnot(loosejson) // interpolate until the knot is loose
      drawKeywords2D(false, chosenWordBuffer) // use the last randomly chosen word
    }
    drawFoundtext2D()
    //print('amp:' + sound.getLevel())
  }
}

function drawTitle() {
  background(38, 29, 29)
  textFont('ubuntu')
  textSize(width / 50)
  textAlign(CENTER)
  fill(255)
  text('🎤 Click para activar micrófono, silba para navegar', width / 2, height / 2)
  textSize(width / 24)
  fill(105, 2, 2)
  text('Cómo ver con los ojos cerrados', (width / 2) + txRwalk, (height * .45) + tyRwalk)
  textSize(width / 24.2)
  fill(255, 175)
  text('Cómo ver con los ojos cerrados', (width / 2), (height * .45))
  let fac = .15
  txRwalk += map(random(), 0, 1, -fac, fac)
  tyRwalk += map(random(), 0, 1, -fac, fac)
}

function drawShader() {
  hyp.setUniform("iResolution", [width, height]); //pass some values to the shader
  hyp.setUniform("iTime", millis() * .0012); // timefactor
  hyp.setUniform('iMouse', [map(spectralCentroid, 600, 2200, 0, width), map(sound.getLevel(), 0, .02, 0, height)]); //Mapping iMouse functions to sound Hz & amp
  hyp.setUniform("noctaves", noctaves);
  hyp.setUniform("c", c);
  texShader.shader(hyp);
  texShader.box(width, height);
  imageMode(CORNER)
  image(texShader, 0, 0, width, height)
  noStroke()
  fill(30, 240) //38,33,33,250)
  rect(0, 0, width, height) // Creating a veil that obscures shaders
}

function drawShader1() {
  imageMode(CORNER)
  texShader1.shader(hyp1)
  hyp1.setUniform('u_resolution', [width, height])
  hyp1.setUniform('u_time', millis() / 1000)
  hyp1.setUniform('u_mouse', [.4, .2])
  hyp1.setUniform('u_mousestrength', .0135)
  hyp1.setUniform('tex0', sourceCanvas);
  hyp1.setUniform('u_splash', (whistling) ? 2. : .5)
  texShader1.rect(0, 0, width, height)
  sourceCanvas.image(texShader1, 0, 0, width, height)
  blendMode(SCREEN)
  image(sourceCanvas, 0, 0)
  blendMode(BLEND)
}

function analyzeSound() {
  whistlingArray.push(1) // adds 1 at the end
  whistlingArray.shift() // Removes first element and shifts
}

function Bpoint(basestatus, pos, h1pos, h2pos, index) {
  this.index = index
  this.isBase = basestatus
  this.location = createVector(pos.x, pos.y);
  this.h1location = createVector(h1pos.x, h1pos.y);
  this.h2location = createVector(h2pos.x, h2pos.y);
}

function drawBezier() {
  stroke(201, 255, 250)
  strokeWeight(10)
  noFill()
  beginShape()
  for (let i = 0; i < bpointArray.length - 1; i++) { // Draw bezier
    bezier(bpointArray[i].location.x, bpointArray[i].location.y, //anchor1
      bpointArray[i].h2location.x, bpointArray[i].h2location.y, //control1
      bpointArray[i + 1].h1location.x, bpointArray[i + 1].h1location.y, //control2
      bpointArray[i + 1].location.x, bpointArray[i + 1].location.y) //anchor2
  }
  bezier(bpointArray[bpointArray.length - 1].location.x, bpointArray[bpointArray.length - 1].location.y, // connect last one w/first
    bpointArray[bpointArray.length - 1].h2location.x, bpointArray[bpointArray.length - 1].h2location.y,
    bpointArray[0].h1location.x, bpointArray[0].h1location.y,
    bpointArray[0].location.x, bpointArray[0].location.y)
  endShape()
}

function updatebpointArray(json) {
  if (bpointArray.length == Object.keys(json).length) {
    for (i = 0; i < bpointArray.length; i++) { // replacing bpoint params, addingcenter and window offset to positions
      bpointArray[i].location.x = json[i].lx + ((windowWidth / 2) - json[i].cx) + json[i].offx
      bpointArray[i].location.y = json[i].ly + ((windowHeight / 2) - json[i].cy) + json[i].offy
      bpointArray[i].h1location.x = json[i].h1x + ((windowWidth / 2) - json[i].cx) + json[i].offx
      bpointArray[i].h1location.y = json[i].h1y + ((windowHeight / 2) - json[i].cy) + json[i].offy
      bpointArray[i].h2location.x = json[i].h2x + ((windowWidth / 2) - json[i].cx) + json[i].offx
      bpointArray[i].h2location.y = json[i].h2y + ((windowHeight / 2) - json[i].cy) + json[i].offy
      bpointArray[i].index = json[i].index;
      bpointArray[i].isBase = json[i].isBase;
    }
    baseArray.length = 0 //emptying base Array
    for (i = 0; i < bpointArray.length; i++) { // filling with new bases
      if (bpointArray[i].isBase) baseArray.push(bpointArray[i])
    }
  } else { // consoleprint the number of bpoints required
    print("add Bpoints:" + bpointArray.length + "/" + Object.keys(json).length)
  }
}

function drawFloaters(floater, seedOffset, index) { // drawing them floaters
  push()
  let floX = noise(seed1 + seedOffset)
  floX = map(floX, 0, 1, -100, width + 100) //map nise to canvas size
  let floY = noise(seed2 + seedOffset)
  floY = map(floY, 0, 1, -100, height + 100)
  seed1 += .00017 //move in noisespace
  seed2 += .00017
  translate(floX, floY) // translate by xy noisypos
  rotate(floRots[index]) // rotate by rotationsarray
  floRots[index] += map(noise(seed1), 0, 1, -.4, .4) // adding a noisy ammount to rotationsarray
  image(floater, 0, 0)
  pop()
}

function drawKeywords2D(arewewhistling, choose) {
  // Choose randomly between set depending on zone2D and display them
  // Display also all texts where that word is found, let the user choose one
  if (choose != undefined) chosenWordBuffer = choose
  textSize(height / 30)
  fill(200)
  noStroke()
  textAlign(CENTER)
  if (zone2D != undefined) { //if zone2D is defined, draw chosen keyword, else draw the buffer keyword
    if (arewewhistling) {
      text(keyWords[zone2D].s[choose], width / 2, height * .15)
    } else if (chosenWordBuffer != undefined) {
      text(keyWords[zone2D].s[chosenWordBuffer], width / 2, height * .15)
    }
  }
}

function drawFoundtext2D() {
  let contextsize = 50
  noStroke()
  textSize(height / 60)
  textStyle(ITALIC)
  let currKeyword
  if ((chosenWordBuffer != undefined) && (zone2D != undefined)) { //if currKeyword is initialized and defined
    currKeyword = keyWords[zone2D].s[chosenWordBuffer] // defined currKeyword as actual currC keyword
    getStrIndex(textArray[1], currKeyword) // get its index in text string
    text(textArray[1].slice(iStrFound[0] - contextsize, iStrFound[0] + currKeyword.length + contextsize), // Slice it and surrounding 20 strings to draw them
      width * .5, height * .85)
  }
  textStyle(NORMAL)
}

function getStrIndex(sourceStr, searchStr) {
  iStrFound = [...sourceStr.matchAll(new RegExp(searchStr, 'gi'))].map(a => a.index)
}

function drawAttractor() { // Drawing attractors between base bpoints
  let apos1 = p5.Vector.lerp(baseArray[0].location, baseArray[1].location, .5)
  let apos2 = p5.Vector.lerp(baseArray[2].location, baseArray[3].location, .5)
  strokeWeight(5)
  stroke(200, 75)
  noFill()
  ellipse(apos1.x, apos1.y, 20)
  ellipse(apos2.x, apos2.y, 20)
}
/////2D
function sqInterpolatebpointArray2D(jsonArray) { //interpolate2D w clamping and zone declaration
  centroids.push(map(spectralCentroid, minHz, maxHz, 0, 3)) //push Centroid to average it with previous
  centroids.shift()
  clampedhBuffer.push(centroids[10]) // We discard the last 11 centroid frames (because of whistling detect buffer)
  clampedhBuffer.shift()
  let avgHz = clampedhBuffer.reduce((a, b) => a + b, 0) / clampedhBuffer.length // we avg clamped 10 frames
  let hz = avgHz // pass avgHz to hz
  if (hz > 2) { // if hz is high we must map volume much lower
    volumeBuffer.push(map(sound.getLevel(), 0, .012, 0, 3))
  } else if (sound.getLevel() < .012) { // this shifts the proportions of each volume compartment
    volumeBuffer.push(map(sound.getLevel(), 0, .012, 0, 1))
  } else if (sound.getLevel() < .019) { // this shifts the proportions of each volume compartment
    volumeBuffer.push(map(sound.getLevel(), .012, .019, 1, 2))
  } else { // this shifts the proportions of each volume compartment
    volumeBuffer.push(map(sound.getLevel(), .019, .025, 2, 3))
  }
  volumeBuffer.shift()
  clampedvBuffer.push(volumeBuffer[20]) // We discard the last 11 volume frames (because of whistling detect buffer)
  clampedvBuffer.shift()
  let avgVol = clampedvBuffer.reduce((a, b) => a + b, 0) / clampedvBuffer.length // we avg clamped 20 frames
  let vol = avgVol // pass avgVol from clampedvBuffer to vol
  let ks // Knotspace value
  let json1 // json holders
  let json2
  let json3
  let json4
  let j1lerpj2 //objects holding lerped jsons for finallerp
  let j3lerpj4
  let sq = .2 // squaresize for easier landing on a knot

  if (hz < sq) {
    updatebpointArray(jsonArray[0])
  } else if (isBetween(hz, 1 - sq, 1 + sq, true) && (vol < sq)) {
    updatebpointArray(jsonArray[1])
  } else if (isBetween(hz, 1 - sq, 1 + sq, true) && isBetween(vol, 1 - sq, 1 + sq, true)) {
    updatebpointArray(jsonArray[2])
  } else if (isBetween(hz, 1 - sq, 1 + sq, true) && (vol > (2 - sq))) {
    updatebpointArray(jsonArray[3])
  } else if (isBetween(hz, 2 - sq, 2 + sq, true) && (vol < sq)) {
    updatebpointArray(jsonArray[4])
  } else if (isBetween(hz, 2 - sq, 2 + sq, true) && isBetween(vol, 1 - sq, 1 + sq, true)) {
    updatebpointArray(jsonArray[5])
  } else if (isBetween(hz, 2 - sq, 2 + sq, true) && (vol > (2 - sq))) {
    updatebpointArray(jsonArray[6])
  } else if ((hz > (3 - sq)) && (vol < sq)) {
    updatebpointArray(jsonArray[7])
  } else if ((hz > (3 - sq)) && isBetween(vol, 1 - sq, 1 + sq, true)) {
    updatebpointArray(jsonArray[8])
  } else if ((hz > (3 - sq)) && (vol > (2 - sq))) {
    updatebpointArray(jsonArray[9])
  }
  if (hz <= 1) { // zone 0
    zone2D = 0
    json1 = jsonArray[0] //
    json2 = jsonArray[0]
    //fill j1 lerp j2 , no need to lerp here
    j1lerpj2 = new resultObj()
    for (i = 0; i < bpointArray.length; i++) {
      j1lerpj2.locarray[i] = createVector(json1[i].lx + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
        json1[i].ly + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
      j1lerpj2.h1array[i] = createVector(json1[i].h1x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
        json1[i].h1y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
      j1lerpj2.h2array[i] = createVector(json1[i].h2x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
        json1[i].h2y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
    }
    if (vol <= 1) { // zone 1.1
      json3 = jsonArray[1]
      json4 = jsonArray[2]
      //j3 lerp j4 by volume
      ks = map(vol, sq, 1 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, sq, 1 - sq, 0, 1, true)
      finalLerp(j1lerpj2, j3lerpj4, ks)
    } else { // zone 1.2
      json3 = jsonArray[2]
      json4 = jsonArray[3]
      //j3 lerp j4 by volume
      ks = map(vol, 1 + sq, 2 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, sq, 1 - sq, 0, 1, true)
      finalLerp(j1lerpj2, j3lerpj4, ks)
    }
  } else if (hz <= 2) { // zones 123
    if (vol <= 1) { // zone 1
      zone2D = 1
      json1 = jsonArray[1] //
      json2 = jsonArray[2]
      json3 = jsonArray[4] //
      json4 = jsonArray[5]
      //j1 lerp j2 by volume
      ks = map(vol, sq, 1 - sq, 0, 1, true) // map volume, constrainValue true
      j1lerpj2 = new resultObj()
      lerpThis(json1, json2, ks, j1lerpj2)
      //j3 lerp j4 by volume
      ks = map(vol, sq, 1 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, 1 + sq, 2 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    } else if (vol <= 2) { // zone 2
      zone2D = 2
      json1 = jsonArray[2] //
      json2 = jsonArray[3]
      json3 = jsonArray[5] //
      json4 = jsonArray[6]
      //j1 lerp j2 by volume
      ks = map(vol, 1 + sq, 2 - sq, 0, 1, true) // map volume, constrainValue true
      j1lerpj2 = new resultObj()
      lerpThis(json1, json2, ks, j1lerpj2)
      //j3 lerp j4 by volume
      ks = map(vol, 1 + sq, 2 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, 1 + sq, 2 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    } else { // zone 3
      zone2D = 3
      json1 = jsonArray[3] //
      json2 = jsonArray[3]
      json3 = jsonArray[6] //
      json4 = jsonArray[6]
      // No need to consider volume anymore just pass values into resultObjs and make finallerp
      j1lerpj2 = new resultObj()
      for (i = 0; i < bpointArray.length; i++) {
        j1lerpj2.locarray[i] = createVector(json1[i].lx + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].ly + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
        j1lerpj2.h1array[i] = createVector(json1[i].h1x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].h1y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
        j1lerpj2.h2array[i] = createVector(json1[i].h2x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].h2y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
      } // using json1
      j3lerpj4 = new resultObj()
      for (i = 0; i < bpointArray.length; i++) {
        j3lerpj4.locarray[i] = createVector(json3[i].lx + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].ly + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
        j3lerpj4.h1array[i] = createVector(json3[i].h1x + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].h1y + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
        j3lerpj4.h2array[i] = createVector(json3[i].h2x + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].h2y + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
      } // using json2
      //redefine ks in hz
      ks = map(hz, 1 + sq, 2 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    }
  } else { // zones 456
    if (vol <= 1) { // zone 4
      zone2D = 4
      json1 = jsonArray[4] //
      json2 = jsonArray[5]
      json3 = jsonArray[7] //
      json4 = jsonArray[8]
      //j1 lerp j2 by volume
      ks = map(vol, sq, 1 - sq, 0, 1, true) // map volume, constrainValue true
      j1lerpj2 = new resultObj()
      lerpThis(json1, json2, ks, j1lerpj2)
      //j3 lerp j4 by volume
      ks = map(vol, sq, 1 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, 2 + sq, 3 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    } else if (vol <= 2) { // zone 5
      zone2D = 5
      json1 = jsonArray[5] //
      json2 = jsonArray[6]
      json3 = jsonArray[8] //
      json4 = jsonArray[9]
      //j1 lerp j2 by volume
      ks = map(vol, 1 + sq, 2 - sq, 0, 1, true) // map volume, constrainValue true
      j1lerpj2 = new resultObj()
      lerpThis(json1, json2, ks, j1lerpj2)
      //j3 lerp j4 by volume
      ks = map(vol, 1 + sq, 2 - sq, 0, 1, true) // map volume, constrainValue true
      j3lerpj4 = new resultObj()
      lerpThis(json3, json4, ks, j3lerpj4)
      //redefine ks in hz
      ks = map(hz, 2 + sq, 3 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    } else { // zone 6
      zone2D = 6
      json1 = jsonArray[6] //
      json2 = jsonArray[6]
      json3 = jsonArray[9] //
      json4 = jsonArray[9]
      // No need to consider volume anymore just pass values into resultObjs and make finallerp
      j1lerpj2 = new resultObj()
      for (i = 0; i < bpointArray.length; i++) {
        j1lerpj2.locarray[i] = createVector(json1[i].lx + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].ly + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
        j1lerpj2.h1array[i] = createVector(json1[i].h1x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].h1y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
        j1lerpj2.h2array[i] = createVector(json1[i].h2x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx,
          json1[i].h2y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy)
      } // using json1
      j3lerpj4 = new resultObj()
      for (i = 0; i < bpointArray.length; i++) {
        j3lerpj4.locarray[i] = createVector(json3[i].lx + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].ly + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
        j3lerpj4.h1array[i] = createVector(json3[i].h1x + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].h1y + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
        j3lerpj4.h2array[i] = createVector(json3[i].h2x + ((windowWidth / 2) - json3[i].cx) + json3[i].offx,
          json3[i].h2y + ((windowHeight / 2) - json3[i].cy) + json3[i].offy)
      } // using json2
      //redefine ks in hz
      ks = map(hz, 2 + sq, 3 - sq, 0, 1, true) // map hz, constrainValue true
      finalLerp(j1lerpj2, j3lerpj4, ks)
    }
  }
  //print('zone2D:' + zone2D, 'v:' + ((round(volumeBuffer[30] * 1000)) / 1000) + '|' + ((round(vol * 1000)) / 1000),'hz:' + ((round(centroids[20] * 1000)) / 1000) + '|' + ((round(hz * 1000)) / 1000)) // debug my life
}

function resultObj() {
  this.locarray = []
  this.h1array = []
  this.h2array = []
}

function lerpThis(json1, json2, factor, resultObj) {
  let locorigin = createVector()
  let h1origin = createVector()
  let h2origin = createVector()
  let loctarget = createVector()
  let h1target = createVector()
  let h2target = createVector()
  for (i = 0; i < bpointArray.length; i++) {
    locorigin.x = json1[i].lx + ((windowWidth / 2) - json1[i].cx) + json1[i].offx
    locorigin.y = json1[i].ly + ((windowHeight / 2) - json1[i].cy) + json1[i].offy
    h1origin.x = json1[i].h1x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx
    h1origin.y = json1[i].h1y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy
    h2origin.x = json1[i].h2x + ((windowWidth / 2) - json1[i].cx) + json1[i].offx
    h2origin.y = json1[i].h2y + ((windowHeight / 2) - json1[i].cy) + json1[i].offy

    loctarget.x = json2[i].lx + ((windowWidth / 2) - json2[i].cx) + json2[i].offx
    loctarget.y = json2[i].ly + ((windowHeight / 2) - json2[i].cy) + json2[i].offy
    h1target.x = json2[i].h1x + ((windowWidth / 2) - json2[i].cx) + json2[i].offx
    h1target.y = json2[i].h1y + ((windowHeight / 2) - json2[i].cy) + json2[i].offy
    h2target.x = json2[i].h2x + ((windowWidth / 2) - json2[i].cx) + json2[i].offx
    h2target.y = json2[i].h2y + ((windowHeight / 2) - json2[i].cy) + json2[i].offy

    resultObj.locarray[i] = p5.Vector.lerp(locorigin, loctarget, factor)
    resultObj.h1array[i] = p5.Vector.lerp(h1origin, h1target, factor)
    resultObj.h2array[i] = p5.Vector.lerp(h2origin, h2target, factor)
  }
}

function finalLerp(obj1, obj2, factor) {
  for (i = 0; i < bpointArray.length; i++) {
    bpointArray[i].location = p5.Vector.lerp(obj1.locarray[i], obj2.locarray[i], factor)
    bpointArray[i].h1location = p5.Vector.lerp(obj1.h1array[i], obj2.h1array[i], factor)
    bpointArray[i].h2location = p5.Vector.lerp(obj1.h2array[i], obj2.h2array[i], factor)
  }
}
/////
function isBetween(num, rangelower, rangeupper, inclusive) { // is a number between these two?
  let min = Math.min(rangelower, rangeupper)
  let max = Math.max(rangelower, rangeupper)
  return inclusive ? num >= min && num <= max : num > min && num < max
}

function interpolatetoLooseKnot(json) { // advance every frame towards loosejson position
  let loctarget = createVector()
  let h1target = createVector()
  let h2target = createVector()
  if (bpointArray.length == Object.keys(loosejson).length) {
    for (i = 0; i < bpointArray.length; i++) {
      loctarget.x = json[i].lx + ((windowWidth / 2) - json[i].cx) + json[i].offx
      loctarget.y = json[i].ly + ((windowHeight / 2) - json[i].cy) + json[i].offy
      h1target.x = json[i].h1x + ((windowWidth / 2) - json[i].cx) + json[i].offx
      h1target.y = json[i].h1y + ((windowHeight / 2) - json[i].cy) + json[i].offy
      h2target.x = json[i].h2x + ((windowWidth / 2) - json[i].cx) + json[i].offx
      h2target.y = json[i].h2y + ((windowHeight / 2) - json[i].cy) + json[i].offy
      bpointArray[i].location = p5.Vector.lerp(bpointArray[i].location, loctarget, vel)
      bpointArray[i].h1location = p5.Vector.lerp(bpointArray[i].h1location, h1target, vel)
      bpointArray[i].h2location = p5.Vector.lerp(bpointArray[i].h2location, h2target, vel)
    }
    vel *= 1.1 // accelerate vel exponentially
    if (near(bpointArray[5].location.y,
        json[5].ly + ((windowHeight / 2) - json[5].cy) + json[5].offy,
        .05)) { // if near to looseknot by .05, reset vel
      vel = .0001
      loosening = false
      for (let i = 0; i < 8; i++) {
        whistlingArray[i] = 0
      }
      whistling = false
    } else {
      loosening = true
      whistling = false
    }
  } else { // consoleprint the number of bpoints required
    print("Loose knot - add Bpoints:" + bpointArray.length + "/" + Object.keys(json).length)
  }
}

function near(num1, num2, factor) {
  return (num1 > (num2 - factor) && num1 < (num2 + factor))
}

function keyPressed() {
  if (keyCode === 84) updatebpointArray(testknots[0]) //t
  if (keyCode === 76) looseknot = !looseknot //l
}

function mousePressed() { //Activate audio, Points activate with a click before being able to drag them
  if (!permissiongiven) {
    permissiongiven = true // variable so that this only is defined once
    userStartAudio() // p5 sound is initialized
    whistlerr.detect(() => analyzeSound()) // Whistlerr needs to recieve a function created right here
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  sourceCanvas = createGraphics(windowWidth, windowHeight - 4) // reinitializing sourceCanvas graphics so that shader1 is updated to new windowSize
}
// Shader reference by Pierre MARZIN
const frag = `

#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform int noctaves;
uniform float c[22];
float mousefactor;

float noise( in vec2 x )
{
	return sin(1.5*x.x)*sin(1.5*x.y);
}

const mat2 rot = mat2( 0.80,  0.6, -0.6,  0.8 );
float fbm ( in vec2 _st) {
    float v = 0.0;
    float a = 0.6;
    vec2 shift = 10.0*vec2(c[11],c[12]);
    for (int i = 0; i < 12; ++i) {
		if(i>=noctaves)break;
        v += a * noise(_st);
        _st = rot*_st* 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

//manipulate b,c,s
mat4 brightnessMatrix( float brightness )
{
    return mat4( 1, 0, 0, 0,
                 0, 1, 0, 0,
                 0, 0, 1, 0,
                 brightness, brightness, brightness, 1 );
}

mat4 contrastMatrix( float contrast )
{
	float t = ( 1.0 - contrast ) / 2.0;

    return mat4( contrast, 0, 0, 0,
                 0, contrast, 0, 0,
                 0, 0, contrast, 0,
                 t, t, t, 1 );

}

mat4 saturationMatrix( float saturation )
{
    vec3 luminance = vec3( 0.3086, 0.6094, 0.0820 );

    float oneMinusSat = 1.0 - saturation;

    vec3 red = vec3( luminance.x * oneMinusSat );
    red+= vec3( saturation, 0, 0 );

    vec3 green = vec3( luminance.y * oneMinusSat );
    green += vec3( 0, saturation, 0 );

    vec3 blue = vec3( luminance.z * oneMinusSat );
    blue += vec3( 0, 0, saturation );

    return mat4( red,     0,
                 green,   0,
                 blue,    0,
                 0, 0, 0, 1 );
}

const float brightness = 0.15; //def.15
const float contrast = 1.2; //def1.2
const float saturation = 1.5; // def1.5

void main() {
		vec2 mouse=iMouse/iResolution;
    vec2 st =(-iResolution.xy+2.0*gl_FragCoord.xy)/iResolution.y;//(gl_FragCoord.xy/iResolution.xy);//
    vec3 color = vec3(0.);
    vec2 q = vec2(0.);


    q.x = fbm( st+vec2(c[0],3.*.04*iTime) ); // def.01 is angle of movement
    q.y = fbm( st+vec2(c[2],c[3]) );
    vec2 r = vec2(0.);

//play with the values here!
		r.x = fbm( st+ (3.0*mouse.x+0.4)*q+vec2(c[5],c[6]));
    r.y = fbm( st+ (6.0*mouse.y+0.5)*q*sin(.01*iTime)+vec2(c[8]*.05*iTime,c[9]));
    float f = fbm(st+c[10]*(r+length(q) ));
    color = smoothstep(vec3(0.101961,0.19608,0.666667),vec3(0.666667,0.666667,0.98039),color); //(0.101961,0.19608,0.666667),vec3(0.666667,0.666667,0.98039)

    //color = mix(color,vec3(1.856,.05*(1.0+cos(1.5+.2*iTime)),0.164706),r.y+length(q));//
    color = mix(color,vec3(1.,.05*(1.0+cos(1.5+.2*iTime)),0.164706),r.y+length(q));//

    //color = mix(color,vec3(1.5*sin(.1*iTime),0.0,cos(.13*iTime)),length(r+q))
    color = mix(color,vec3(1.5*sin(.2*iTime),0.0,1.2*cos(.25*iTime)),length(r+q));// titilation between colors//.2+.2*(1.0+cos(0.5+.3*iTime)) //

    color = mix( color, vec3(0.9,0.9,0.9), dot(r,r) ); //def .9.9.9
		color*=(.6*f*f*f*f+.6*f*f+.6*f); // mixing of channels def (1.5*f*f*f+1.8*f*f+1.7*f); like .6.8.6
		color+=.4*vec3(1.8+r.x,0.7+q); // brightness def color+=.4*vec3(1.8+r.x,0.7+q)
		color=pow(color, vec3(1.5)); // contrast def.5 like .8

    vec4 finalcolor = vec4(color,1.);
    finalcolor = brightnessMatrix( brightness ) *
        		contrastMatrix( contrast ) *
        		saturationMatrix( saturation ) *
        		finalcolor;

    gl_FragColor = vec4(color,1.);
}

`
const vert = `
//standard vertex shader
#ifdef GL_ES
      precision highp float;
    #endif
		#extension GL_OES_standard_derivatives : enable
    // attributes, in
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aTexCoord;
    attribute vec4 aVertexColor;

    // attributes, out
    varying vec3 var_vertPos;
    varying vec4 var_vertCol;
    varying vec3 var_vertNormal;
    varying vec2 var_vertTexCoord;

    // matrices
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat3 uNormalMatrix;

    void main() {
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);

      // just passing things through
      var_vertPos      = aPosition;
      var_vertCol      = aVertexColor;
      var_vertNormal   = aNormal;
      var_vertTexCoord = aTexCoord;
    }
`;
/// Shader 2 blurring hypnagogias
const frag1 = `
	#ifdef GL_ES
	precision mediump float;
	#endif

  #define PI 3.141592653589793
  #define TAU 6.283185307179586

	uniform vec2 u_resolution;
	uniform vec2 u_mouse;
	uniform float u_time;
	uniform sampler2D tex0;
  uniform float u_splash;
  uniform float u_mousestrength;

	varying vec2 vTexCoord;

#define pow2(x) (x * x)

const int samples = 8;
const float sigma = float(samples) * 0.25;

float gaussian(vec2 i) {
    return 1.0 / (2.0 * PI * pow2(sigma)) * exp(-((pow2(i.x) + pow2(i.y)) / (2.0 * pow2(sigma))));
}

vec3 blur(sampler2D sp, vec2 uv, vec2 scale) {
    vec3 col = vec3(0.0);
    float accum = 0.0;
    float weight;
    vec2 offset;

    for (int x = -samples / 2; x < samples / 2; ++x) {
        for (int y = -samples / 2; y < samples / 2; ++y) {
            offset = vec2(x, y);
            weight = gaussian(offset);
            col += texture2D(sp, uv + scale * offset).rgb * weight;
            accum += weight;
        }
    }

    return col / accum;
}


	float rand(vec2 c){
		return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
	}

	//	Classic Perlin 3D Noise
	//	by Stefan Gustavson
	//
	vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
	vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
	vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

	float cnoise(vec3 P){
		vec3 Pi0 = floor(P); // Integer part for indexing
		vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
		Pi0 = mod(Pi0, 289.0);
		Pi1 = mod(Pi1, 289.0);
		vec3 Pf0 = fract(P); // Fractional part for interpolation
		vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
		vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
		vec4 iy = vec4(Pi0.yy, Pi1.yy);
		vec4 iz0 = Pi0.zzzz;
		vec4 iz1 = Pi1.zzzz;

		vec4 ixy = permute(permute(ix) + iy);
		vec4 ixy0 = permute(ixy + iz0);
		vec4 ixy1 = permute(ixy + iz1);

		vec4 gx0 = ixy0 / 7.0;
		vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
		gx0 = fract(gx0);
		vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
		vec4 sz0 = step(gz0, vec4(0.0));
		gx0 -= sz0 * (step(0.0, gx0) - 0.5);
		gy0 -= sz0 * (step(0.0, gy0) - 0.5);

		vec4 gx1 = ixy1 / 7.0;
		vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
		gx1 = fract(gx1);
		vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
		vec4 sz1 = step(gz1, vec4(0.0));
		gx1 -= sz1 * (step(0.0, gx1) - 0.5);
		gy1 -= sz1 * (step(0.0, gy1) - 0.5);

		vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
		vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
		vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
		vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
		vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
		vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
		vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
		vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

		vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
		g000 *= norm0.x;
		g010 *= norm0.y;
		g100 *= norm0.z;
		g110 *= norm0.w;
		vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
		g001 *= norm1.x;
		g011 *= norm1.y;
		g101 *= norm1.z;
		g111 *= norm1.w;

		float n000 = dot(g000, Pf0);
		float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
		float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
		float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
		float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
		float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
		float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
		float n111 = dot(g111, Pf1);

		vec3 fade_xyz = fade(Pf0);
		vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
		vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
		float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
		return 2.2 * n_xyz;
	}


	void main(){

		vec2 st = vTexCoord;
		vec2 stDistorted = st*1.0001+vec2(cnoise(vec3(vTexCoord*500.,u_time*2.)),
															 cnoise(vec3(vTexCoord*500.,u_time*2.+100.)))*0.12
												;

 		st.y = 1.0 - st.y;
 		stDistorted.y = 1.0 - stDistorted.y;
		vec3 color = vec3(0.);

		vec3 tex = blur(tex0,st,vec2(0.01));
		// vec4 texg = texture2D(tex0,sin(st*30.+u_time)*st);
		// vec4 texb = texture2D(tex0,sin(st*20.+u_time)*st);

		float d = distance(stDistorted,u_mouse);
		float d2 = distance(stDistorted,u_mouse+vec2(cos(u_time),sin(u_time))*0.1 );
		float d3 = distance(stDistorted,u_mouse+vec2(cos(u_time+PI),sin(u_time+PI))*0.1);

    // u_mouse control
		// color.r+=smoothstep(0.1+sin(u_time+.1)*0.05,0.01,d)*(sin(u_time*1.)+1.) ;
		// color.g+=smoothstep(0.1+sin(u_time*1.5+.2)*0.05,0.02,d2)*(sin(u_time*2.)+1.);
		// color.b+=smoothstep(0.1+sin(u_time*5.+.3)*0.05,0.03,d3)*(sin(u_time*3.)+1.);

//connecting to a boolean, over 1 is true, else false, green is scaled to .6
 if (u_splash>1.){
    color.r+=u_mousestrength*(smoothstep(0.1+sin(u_time+.1)*0.05,0.01,d)*(sin(u_time*1.)+1.)) ;
    color.g+=(u_mousestrength*.6)*(smoothstep(0.1+sin(u_time*1.5+.2)*0.05,0.02,d2)*(sin(u_time*2.)+1.));
    color.b+=(u_mousestrength*.9)*(smoothstep(0.1+sin(u_time*5.+.3)*0.05,0.03,d3)*(sin(u_time*3.)+1.));
}


		color += tex*0.9999*(1.+cnoise(vec3((stDistorted	 -vec2(0,0.5)	)*20.,u_time+st.x+st.y))/10.);

// speed of color extinction
		color*=0.9995;

		// color.r+=cnoise(vec3(st,u_time))*0.1;
		if (color.r<0.005){
			color.r=0.;
		}
		if (color.g<0.005){
			color.g=0.;
		}
		if (color.b<0.005){
			color.b=0.;
		}
		gl_FragColor= vec4(color,1.0);
	}
`
const vert1 = `
// vert file and comments from adam ferriss
// https://github.com/aferriss/p5jsShaderExamples

// our vertex data
attribute vec3 aPosition;
attribute vec2 aTexCoord;

// lets get texcoords just for fun!
varying vec2 vTexCoord;

void main() {
  // copy the texcoords
  vTexCoord = aTexCoord;

  // copy the position data into a vec4, using 1.0 as the w component
  vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0;

  // send the vertex information on to the fragment shader
  gl_Position = positionVec4;
}
`;
