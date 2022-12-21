OSCFunc.dump

OSCFunc.trace

~last = 0;
~cur = 0;
i = 0;
~arr = List.new(1024);
f = OSCFunc.new({|msg, time, addr, recvPort|
	~last = ~cur;
	~cur = time;
	~arr.add([msg[1], ~cur-~last]);
}, "/cycles");


~arr.do({|i| i.postln})

~arr[0] = 0.005
~arr.sum[1] / ~arr.size