import { WebSocketServer } from 'ws';
import { Voronoi } from "./rhill-voronoi-core.mjs";

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
        console.log('received: %s', data);
    });

    ws.send('something');
});