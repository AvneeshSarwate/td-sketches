console.log("some shit");

// const WEBSOCKET_URL = 'ws'+location.origin.slice(4, -4) + document.getElementById('websocket_port').innerText;
const WEBSOCKET_URL = 'ws'+location.origin.slice(4);
console.log(WEBSOCKET_URL);
const parameters = {}

const websocket = new WebSocket(WEBSOCKET_URL);
websocket.onopen = e => console.log("ws open", e);
websocket.onerror = e => console.log("ws error", e);

const slidersContainer = document.getElementById('slidersContainer');
let sliderList = [];

/**
 * @param {String} html 
 * @returns {HTMLElement}
 */
function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

/**
 * @param {String} addr 
 * @param {String} val 
 */
function sendSliderMessage(addr, val) {
    websocket.send(JSON.stringify({addr, val}));
}

/**
 * @param {String} sliderName 
 */
function createSlider(sliderName) {
    const sliderTemplate = `
    <span id=${sliderName}Container><input id=${sliderName} type="range" min="0" max="1" step="0.001"> <label>${sliderName}<label> </span> 
    `

    const singleContainer = htmlToElement(sliderTemplate);
    slidersContainer.append(singleContainer);
    const slider = document.getElementById(sliderName);
    slider.onchange = function(val) {
        sendSliderMessage(sliderName, val)
    }
}


/**
 * @param {String[]} arr1 
 * @param {String[]} arr2 
 * @returns {Boolean}
 */
function arrayEq(arr1, arr2) {
    const arr1Sort = arr1.map(e => e).sort();
    const arr2Sort = arr2.map(e => e).sort();
    if(arr1Sort.length != arr2Sort.length) return false;
    for(let i = 0; i < arr1Sort.length; i++) {
        if(arr1Sort[i] != arr2Sort[i]) return false;
    }
    return;
}

websocket.onmessage= e => {
    console.log("ws message", e);
    const newSliders = JSON.parse(e.data);
    if(arrayEq(newSliders, sliderList)) {
        slidersContainer.innerHTML = "";
        newSliders.forEach(name => createSlider(name));
    }
};
