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
function sendControlMessage(addr, val, parent, type) {
    websocket.send(JSON.stringify({addr, val, parent, type}));
}

/**
 * @param {String} sliderName 
 */
function createSlider(sliderName, containerName) {
    const htmlId = sliderName + '_' + containerName;
    const sliderTemplate = `
    <div>
        <span id=${htmlId}Container>
            <input class="slider" id=${htmlId} type="range" min="0" max="1" step="0.001"> <label>${sliderName}<label> 
        </span>
        <br><br>
    </div> 
    `

    const singleContainer = htmlToElement(sliderTemplate);
    document.getElementById(containerName).append(singleContainer);
    const slider = document.getElementById(htmlId);
    slider.oninput = function(val) {
        sendControlMessage(sliderName, val.currentTarget.value, containerName, 'slider');
    }
}

function createButton(buttonName, containerName) {
    const htmlId = buttonName + '_' + containerName;
    const buttonTemplate = `
    <div>
        <span id=${htmlId}Container>
            <input class="button" id=${htmlId} type="button" min="0" max="1" step="0.001"> <label>${buttonName}<label> 
        </span>
        <br><br>
    </div> 
    `

    const singleContainer = htmlToElement(buttonTemplate);
    document.getElementById(containerName).firstChild.append(singleContainer); //Buttons have a sub-container
    const button = document.getElementById(htmlId);
    button.oninput = function(val) {
        sendControlMessage(buttonName, val.currentTarget.value, containerName, 'button');
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

function splitSlidersByModule(slider_spec) {
    const sliders_by_module = {};
    slider_spec.forEach(spec => {
        const module_name = spec[3].split("/")[2];
        if(!sliders_by_module[module_name]) {
            sliders_by_module[module_name] = [];
        }
        sliders_by_module[module_name].push(module_name);
    });
    return sliders_by_module;
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
        // slidersContainer.innerHTML = "";
        // sliders.forEach(name => createSlider(name));
        // controlList = newControls;
        const slidersByModule = splitSlidersByModule(slider_spec);
        Object.keys(slidersByModule).forEach(mod_name => {
            const mod_container = document.getElementById(mod_name);
            mod_container.innerHTML = '<div class="buttons"></div>';

            //split buttons and put them in a horizontal row at top of source module
            slidersByModule[mod_name].filter(conf => conf[1] == "buttonCOMP").forEach(conf => {
                createButton(conf[0], mod_name);
            });

            //make/splid sliders and add them under buttons
            slidersByModule[mod_name].filter(conf => conf[1] == "buttonCOMP").forEach(conf => {
                if(confg[2] == "u" || confg[2] == "v") {
                    createSlider(confg[0], mod_name);
                } else if(confg[2] == "uv") {
                    createSlider(confg[0] + "_" + "u", mod_name);
                    createSlider(confg[0] + "_" + "v", mod_name);
                }
            });
        })
    }
};
