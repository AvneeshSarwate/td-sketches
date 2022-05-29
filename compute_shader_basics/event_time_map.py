# me - this DAT
# scriptOp - the OP which is cooking
import numpy as np


# press 'Setup Parameters' in the OP to call this function to re-create the parameters.
def onSetupParameters(scriptOp):
    page = scriptOp.appendCustomPage('Custom')
    p = page.appendFloat('Valuea', label='Value A')
    p = page.appendFloat('Valueb', label='Value B')
    return

# called whenever custom pulse parameter is pushed
def onPulse(par):
    return

def onCook(scriptOp):
    id_chan = scriptOp.inputs[0]['id']
    npArray = np.zeros((2, 100), dtype=np.float32)
    if id_chan[0] != -1:

        scriptOp.clear()
        
        time_chan = scriptOp.inputs[0]['time']
        for i in range(len(id_chan)):
            evtId = id_chan[i]
            evtTime = time_chan[i]
            npArray[0][int(evtId) % 100] = evtId
            npArray[1][int(evtId) % 100] = evtTime
    scriptOp.copyNumpyArray(npArray)
    return
