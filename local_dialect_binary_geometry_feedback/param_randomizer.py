# me - this DAT
# par - the Par object that has changed
# val - the current value
# prev - the previous value
# 
# Make sure the corresponding toggle is enabled in the Parameter Execute DAT.
import random
import json

def onValueChange(par, prev):
    # use par.eval() to get current value
    return

# Called at end of frame with complete list of individual parameter changes.
# The changes are a list of named tuples, where each tuple is (Par, previous value)
def onValuesChanged(changes):
    return

def onPulse(par):
    panel = op('..')
    preset_data = []
    for par in panel.customPars:
        if "Preset" in par.page.name:
            continue

        par_name = par.name
        par_expr = '' if par.expr is None or par.expr == '' else par.expr
        par_mode = 'expression' if par.mode == ParMode.EXPRESSION else 'constant'

        if par.isToggle:
            par.val = random.randint(0, 1)
        if par.isMenu:
            par.val = random.randint(0, len(par.menuLabels) - 1)
        if par.isFloat:
            par.val = random.random()
        if par.isInt:
            continue
        
        if par_mode == "expression":
            par.mode = ParMode.EXPRESSION

        par_const = par.val
        par_dict = {'name': par_name, 'constant': par_const, 'expression': par_expr, 'mode': par_mode}
        preset_data.append(par_dict)

    webserver = op('../../synth_control/webserver1')
    clients = op('../../synth_control/ws_clients')
    # debug(webserver, clients)
    if webserver is not None:
        presetMessage = {}
        presetMessage['type'] = 'preset'
        presetMessage['module'] = op('../..').name
        presetMessage['preset_data'] = preset_data
        presetMessageJson = json.dumps(presetMessage)
        for client in clients.rows():
            webserver.webSocketSendText(client[0].val, presetMessageJson)

    return

def onExpressionChange(par, val, prev):
    return

def onExportChange(par, val, prev):
    return

def onEnableChange(par, val, prev):
    return

def onModeChange(par, val, prev):
    return
    