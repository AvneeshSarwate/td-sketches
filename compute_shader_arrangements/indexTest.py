import math

wgSize = 4 * 4
numPixels = 175
roundedUpPixels = math.ceil(numPixels/wgSize) * wgSize
numWg = math.ceil(numPixels/wgSize)

startInds = [i if i < wgSize else 0 for i in range(roundedUpPixels)]
newInds = [0 for i in range(roundedUpPixels)]

getWgInd = lambda ind : math.floor(ind/wgSize)

calcShift = lambda i: (i % wgSize) * wgSize
calcNewInd = lambda i: (startInds[i] + calcShift(i)) % roundedUpPixels

for i in range(roundedUpPixels):
    shift = calcShift(i)
    newInds[i] = (startInds[i] + shift) % roundedUpPixels

print(newInds[0:wgSize])
print()
print(newInds[-wgSize:])

newSet = set(newInds)
len(newSet)