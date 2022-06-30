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
function sendControlMessage(addr, val, parent, type, path) {
    websocket.send(JSON.stringify({addr, val, parent, type, path}));
}

/**
 * @param {String} sliderName 
 */
function createSlider(sliderName, containerName, path) {
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
        sendControlMessage(sliderName, val.currentTarget.value, containerName, 'slider', path);
    }
}

function createButton(buttonName, containerName, path) {
    const htmlId = buttonName + '_' + containerName;
    const buttonTemplate = `
    <span>
        <div id=${htmlId}Container class="buttonAndLabel">
            <input class="button" id=${htmlId} type="button" min="0" max="1" step="0.001"> 
            <div>${buttonName}<div> 
        </div>
    </span> 
    `

    const singleContainer = htmlToElement(buttonTemplate);
    const buttonContainer = document.querySelector(`#${containerName} .buttons`);
    buttonContainer.append(singleContainer); //Buttons have a sub-container
    const button = document.getElementById(htmlId);
    button.onmousedown = val => sendControlMessage(buttonName, 1, containerName, 'button', path);
    button.onmouseup = val => sendControlMessage(buttonName, 0, containerName, 'button', path);

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
        const module_name = spec[3].split("/").at(-2);
        if(!sliders_by_module[module_name]) {
            sliders_by_module[module_name] = [];
        }
        sliders_by_module[module_name].push(spec);
    });
    return sliders_by_module;
}

websocket.onmessage= e => {
    console.log("ws message", e);
    const json_data = JSON.parse(e.data);
    // const sliders = [];
    // newControls.forEach(slider_spec => {
    //     if(slider_spec[1] == "sliderCOMP") {
    //         if(slider_spec[2] == "u" || slider_spec[2] == "v") {
    //             sliders.push(slider_spec[0])
    //         } else if(slider_spec[2] == "uv") {
    //             sliders.push(slider_spec[0] + "_" + "u");
    //             sliders.push(slider_spec[0] + "_" + "v");
    //         }
    //     }
    // } )
    const currentParams = json_data['current_parameters']
    if(currentParams) {
        Object.keys(currentParams).forEach(key => {
            const mod_name = key.split("/")[0];
            const param_name = key.split("/")[1];
            const param_val = currentParams[key];
            const slider = document.querySelector(`#${param_name}_${mod_name}Container input`);
            slider.value = param_val;
        })
    } else {
        const newControls = json_data;
        if(!arrayEq(newControls, controlList)) {
            // slidersContainer.innerHTML = "";
            // sliders.forEach(name => createSlider(name));
            controlList = newControls;
            const slidersByModule = splitSlidersByModule(newControls);
            Object.keys(slidersByModule).forEach(mod_name => {
                const mod_container = document.getElementById(mod_name);
                mod_container.innerHTML = `
                <div class="header">${mod_name}</div>
                <div class="buttons"></div><br>`;
    
                //split buttons and put them in a horizontal row at top of source module
                slidersByModule[mod_name].filter(conf => conf[1] == "buttonCOMP").forEach(conf => {
                    createButton(conf[0], mod_name, conf[3]);
                });
    
                //make/splid sliders and add them under buttons
                slidersByModule[mod_name].filter(conf => conf[1] == "sliderCOMP").forEach(conf => {
                    if(conf[2] == "u" || conf[2] == "v") {
                        createSlider(conf[0], mod_name, conf[3]);
                    } else if(conf[2] == "uv") {
                        createSlider(conf[0] + "_" + "u", mod_name, conf[3]);
                        createSlider(conf[0] + "_" + "v", mod_name, conf[3]);
                    }
                });
            })
        }
    }
   
};
