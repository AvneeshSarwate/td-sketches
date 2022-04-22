console.log("some shit");

// const WEBSOCKET_URL = 'ws'+location.origin.slice(4, -4) + document.getElementById('websocket_port').innerText;
const WEBSOCKET_URL = 'ws'+location.origin.slice(4);
console.log(WEBSOCKET_URL);
const parameters = {}

const websocket = new WebSocket(WEBSOCKET_URL);
websocket.onopen = e => console.log("ws open", e);
websocket.onerror = e => console.log("ws error", e);

const slidersContainer = document.getElementById('slidersContainer');
let controlList = [];

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
    <div>
        <span id=${sliderName}Container>
            <input class="slider" id=${sliderName} type="range" min="0" max="1" step="0.001"> <label>${sliderName}<label> 
        </span>
        <br><br>
    </div> 
    `

    const singleContainer = htmlToElement(sliderTemplate);
    slidersContainer.append(singleContainer);
    const slider = document.getElementById(sliderName);
    slider.oninput = function(val) {
        sendSliderMessage(sliderName, val.currentTarget.value)
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
    const newControls = JSON.parse(e.data);
    const sliders = [];
    newControls.forEach(slider_spec => {
        if(slider_spec[1] == "sliderCOMP") {
            if(slider_spec[2] == "u" || slider_spec[2] == "v") {
                sliders.push(slider_spec[0])
            } else if(slider_spec[2] == "uv") {
                sliders.push(slider_spec[0] + "_" + "u");
                sliders.push(slider_spec[0] + "_" + "v");
            }

        }
    } )
    if(!arrayEq(newControls, controlList)) {
        slidersContainer.innerHTML = "";
        sliders.forEach(name => createSlider(name));
        controlList = newControls;
    }
};