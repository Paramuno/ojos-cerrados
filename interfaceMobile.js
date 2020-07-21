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
  lifeSeed = loadImage("images/Lifeseed.png")
  cvcloc = loadImage("images/cvcloc.png")
  for (let i = 0; i < 6; i++) { //initalizing 6 floater bois and pushing random rotations in a matching array
    floaters.push(loadImage("images/floater" + i + ".png"))
    floRots.push(random(-180, 180))
  }
  for (let i = 0; i < 10; i++) { // initialize all available knots
    testknots.push(loadJSON("data/knot" + i + ".json"))
  }
}

//Shaders variables
let gl, noctaves, c, sourceCanvas, lifeSeed
let saladmode = false

function setup() {
    windowWidth *= .5
    windowHeight *= .5
    document.querySelector('meta[name="viewport"]').content = "initial-scale=0.5"
  createCanvas(windowWidth, windowHeight - 4)
  texShader2 = createGraphics(windowWidth, windowHeight - 4, WEBGL)
  ///
  conway = new p5.Shader(texShader2._renderer, vert2, frag2) // Conway titlepage shader
  texShader2.background(0)
  texShader2.noStroke()
  texShader2.fill(255)
  texShader2.image(lifeSeed, -width / 2 + random(300), -height / 2 + random(300), random(width - 200), random(height - 200))
  let r1 = (-width / 2) + random(width)
  let r2 = (-width / 2) + random(height)
  texShader2.image(lifeSeed, r1, r2, r1 + random(100), r2 + random(100))
  texShader2.shader(conway)
  conway.setUniform("state", texShader2._renderer)
  conway.setUniform("u_windowWidth", width)
  conway.setUniform("u_windowHeight", height)
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
  } else if (!saladmode) {
    background(38, 29, 29)
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
  } else {
    wordSalad()
  }
}

let mouselines = []
let lmouselines = []
let knotTimeout = 255

function wordSalad() {
  background(38, 29, 29, 230)
  strokeWeight(5)
  noFill()
  let prevpos = createVector(pmouseX, pmouseY)
  if (mouseIsPressed && (mouselines.length < 175)) { // hard cap for mouselines size
    mouselines.push(prevpos)
  }
  for (let i = 0; i < mouselines.length; i++) { //draw newknot points
    stroke(255, 50, 50, map(i, 0, mouselines.length, 0, 255))
    point(mouselines[i].x, mouselines[i].y)
  }
  if (knotTimeout > 0) { // if the Timeout hasn't completed
    knotTimeout -= 1
    let strokeBvar = floor(random(230, knotTimeout))
    let strokeGvar = floor(random(230, knotTimeout))
    stroke(255, strokeBvar, strokeGvar)
    //stroke(255, strokeBvar, strokeGvar,knotTimeout)
    let sOff = map(knotTimeout, 0, 255, 25, 0)
    for (let i = 2; i < lmouselines.length - 1; i++) { // draw prevknot
      curve(lmouselines[i + 1].x + sOff, lmouselines[i + 1].y + sOff,
        lmouselines[i].x + sOff, lmouselines[i].y + sOff, lmouselines[i - 1].x + sOff, lmouselines[i - 1].y + sOff,
        lmouselines[i - 2].x + sOff, lmouselines[i - 2].y + sOff)
    }
    if (lmouselines[5] != undefined) { //close knot
      curve(lmouselines[2].x + sOff, lmouselines[2].y + sOff,
        lmouselines[1].x + sOff, lmouselines[1].y + sOff, lmouselines[0].x + sOff, lmouselines[0].y + sOff,
        lmouselines[0].x + sOff, lmouselines[0].y + sOff,
      ) // draw starting and closing curves
      curve(lmouselines[lmouselines.length - 1].x + sOff, lmouselines[lmouselines.length - 1].y + sOff,
        lmouselines[lmouselines.length - 1].x + sOff, lmouselines[lmouselines.length - 1].y + sOff, lmouselines[lmouselines.length - 2].x + sOff, lmouselines[lmouselines.length - 2].y + sOff,
        lmouselines[lmouselines.length - 3].x + sOff, lmouselines[lmouselines.length - 3].y + sOff,
      )
      let h1 = p5.Vector.lerp(lmouselines[0], lmouselines[1], -10)
      let h2 = p5.Vector.lerp(lmouselines[lmouselines.length - 1], lmouselines[lmouselines.length - 2], -10)
      bezier(lmouselines[0].x + sOff, lmouselines[0].y + sOff, //anchor1
        h1.x, h1.y, //ctrl1
        h2.x, h2.y, //ctrl2
        lmouselines[lmouselines.length - 1].x + sOff, lmouselines[lmouselines.length - 1].y + sOff) //anchor2
    }
    background(38, 29, 29, map(knotTimeout, 0, 255, 255, 0))
  }
  stroke(255)
  strokeWeight(1)
  line(0, height - 50, width, height - 50)
  noStroke()
  fill(255)
  text('Ir a la versión con micrófono', width / 2, height - 15)
  for (let i = 0; i < 100; i++) {
    let rX = random(width)
    let rY = random(height - 50)
    let rS = makeString(1)
    text(rS, rX, rY)
  }
}

function makeString(length) {
  let result = '';
  let characters = 'abcdefghijklmnñopqrstuvwxyz␦␚';
  let charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result
}

function saladLetter(x, y) {
  this.pos = createVector(x, y)
  this.value = random(1)
}

function mouseReleased() {
  knotTimeout = 255
  lmouselines = [...mouselines] //spread operator to duplicate array, not referencing it
  mouselines.splice(0, mouselines.length)
}

function drawTitle() {
  drawShader2()
  background(38, 29, 29, 200)
  noStroke()
  textFont('ubuntu')
  textSize(10 + (height / 75))
  textAlign(CENTER)
  fill(255)
  text('🎤 Click para activar micrófono, silba para navegar', 5 + (width / 2), 5 + (height / 2))
  image(cvcloc, (width/2)-180,(height/2)-300)
  // textSize(11 + (height / 40))
  // fill(105, 2, 2)
  // text('Cómo ver con los ojos cerrados', (width / 2) + txRwalk, (height * .45) + tyRwalk)
  // textSize(11 + (height / 40))
  // fill(255, 175)
  // text('Cómo ver con los ojos cerrados', (width / 2), (height * .45))
  let fac = .1
  txRwalk += map(random(), 0, 1, -fac, fac)
  tyRwalk += map(random(), 0, 1, -fac, fac)
  fill(255, 100)
  textSize(10 + (height / 65))
  text(`No tengo
micrófono
  🔇`, width - 100, height - 100)
  fill(255, 240, 240, 10)
  circle(width, height, 500)
}

function drawShader2() {
  texShader2.rect(0, 0, width, height)
  image(texShader2, 0, 0, width, height)
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

function mousePressed() { //Activate audio, Points activate with a click before being able to drag them
  if (!permissiongiven) {
    if ((mouseX > (width - 200)) && (mouseY > (height - 200))) {
      saladmode = true
      userStartAudio()
    } else {
      permissiongiven = true // variable so that this only is defined once
      userStartAudio() // p5 sound is initialized
      whistlerr.detect(() => analyzeSound()) // Whistlerr needs to recieve a function created right here
    }
  }
  if (saladmode && (mouseY > (height - 50))) saladmode = false
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  sourceCanvas = createGraphics(windowWidth, windowHeight - 4) // reinitializing sourceCanvas graphics so that shader1 is updated to new windowSize
}

/// Shader 2 modified conwaynoise
const vert2 = `
		attribute vec3 aPosition;
		attribute vec2 aTexCoord;

		varying vec2 vTexCoord;

		void main() {
			vTexCoord = aTexCoord;

			vec4 positionVec4 = vec4(aPosition, 1.0);
			positionVec4.xy = positionVec4.xy * 2.0 - 1.0;

			gl_Position = positionVec4;
		}
`
const frag2 = `
		precision mediump float;

		varying vec2 vTexCoord;
		uniform sampler2D state;
    uniform float u_windowWidth;
    uniform float u_windowHeight;

		void main() {
			int sum = 0;

			sum += int(texture2D(state, vec2((gl_FragCoord.x + 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y + 4.0) / u_windowHeight)).r); // def 1.0 instead of 4.0
			sum += int(texture2D(state, vec2((gl_FragCoord.x + 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y      ) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x + 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y - 4.0) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x      ) / u_windowWidth, 1.0 - (gl_FragCoord.y - 4.0) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x - 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y - 4.0) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x - 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y      ) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x - 4.0) / u_windowWidth, 1.0 - (gl_FragCoord.y + 4.0) / u_windowHeight)).r);
			sum += int(texture2D(state, vec2((gl_FragCoord.x      ) / u_windowWidth, 1.0 - (gl_FragCoord.y + 4.0) / u_windowHeight)).r);

 			if (sum == 3) {
         gl_FragColor = vec4(1.0, .0, .0, 1.0); // def 1,1,1
       } else if (sum == 2) {
 				float current = texture2D(state, vec2(vTexCoord.x, 1.0 - vTexCoord.y)).r;
        // gl_FragColor = vec4(current, current, current, 1.0);
 				gl_FragColor = vec4(current +.0025, .3, 1.0, 1.0);
 			} else {
        gl_FragColor = vec4(.05, .1,.0, 1.0); // def 0,0,0
      }
		}
`;
