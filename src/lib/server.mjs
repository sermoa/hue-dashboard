'use strict';

import express from 'express';
import cors from 'cors';
import pug from 'pug';

import * as Conversions from './conversions.mjs';
import * as HueAPI from './hue_api.mjs';

const COLOURS = {
  'adfa9c3e-e9aa-4b65-b9d3-c5b2c0576715': '#fbbbcd', // Blomstrende forår
  'b90c8900-a6b7-422c-a5d3-e170187dbf8c': '#fdefc4', // Koncentrer dig
  '7fd2ccc5-5749-4142-b7a5-66405a676f03': '#fcfbfa', // Få ny energi
  'a1f7da49-d181-4328-abea-68c9dc4b5416': '#ffbb58', // Slap af
  'e101a77f-9984-4f61-aac8-15741983c656': '#fbd181', // Læs
  '8c74b9ba-6e89-4083-a2a7-b10a1e566fed': '#f4c574', // Dæmpet
  '732ff1d9-76a7-4630-aad0-c8acc499bb0b': '#f1c272', // Klar
  '28bbfeff-1a0c-444e-bb4b-0b74b88e0c95': '#fd9d2f', // Natlampe
  '4f2ed241-5aea-4c9d-8028-55d2b111e06f': '#fc8d5a', // Solnedgang i Savannah
  'a6a03e6a-fe6e-45bc-b686-878137f3ba91': '#f08e61', // Tropisk tusmørke
  '1e42b2e8-d02e-40d2-9c8d-b1fd8216c686': '#6de2e0', // Arktisk nordlys
  'd271d202-6856-4633-95ae-953ba73aee64': '#fc6737', // Honolulu
  'cc716363-44c2-4d64-88be-152d74072ea0': '#fb3d54', // Fairfax
  '60f088f5-4224-4f01-bcb1-81ef46099f63': '#8c5fca', // Tokyo
  '63d50cd6-5909-4f7b-8810-137d08f57c54': '#fd4d14', // Chinatown
  '6799326d-e9cd-4b2a-9166-287509f841f3': '#fbd27d', // Gyldent efterår
}

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// App
const app = express();
app.use(express.json());
app.use(cors());
app.options('*', cors());
app.set('view engine', 'pug');
app.set('views', './src/views');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  const promiseRooms = HueAPI.getGroups().then(groups => {
    let rooms = [];

    for(let groupId in groups) {
      let group = groups[groupId];
      if(group.type == 'Room' || group.type == 'Zone') {
        let colour = "";
        if(group.state.any_on) {
          if(group.action.xy && group.action.bri) {
            colour = Conversions.xyBriToHex(group.action.xy[0], group.action.xy[1], group.action.bri);
          } else if(group.action.colormode == 'ct') {
            colour = Conversions.ctToHex(group.action.ct);
          }
        }
        rooms.push({
          id: groupId,
          name: group.name,
          state: group.state,
          colour: colour,
          scenes: []
        });
      }
    }

    return rooms;
  });

  Promise.all([promiseRooms, HueAPI.getScenes()]).then(([rooms, scenes]) => {
    for (let sceneId in scenes) {
      let scene = scenes[sceneId];
      if (scene.type == 'GroupScene' && scene.group) {
        let room = rooms.find(e => e.id == scene.group);
        if (room) {
          room.scenes.push({
            id: sceneId,
            name: scene.name,
            image: scene.image,
            imageUrl: `/images/scenes/${scene.image}.png`,
            colour: COLOURS[scene.image]
          })
        }
      }
    }

    res.render('dashboard', {
      title: 'Hue Dashboard',
      rooms: rooms
    });
  });
});

app.put('/room/:roomId/on/:state', (req, res) =>
  HueAPI.request('PUT', `/groups/${req.params.roomId}/action`, {"on": req.params.state == 'true'})
    .then(str => {
      console.log(str);
      res.sendStatus(200);
    })
);

app.put('/room/:roomId/scene/:sceneId', (req, res) =>
  HueAPI.request('PUT', `/groups/${req.params.roomId}/action`, {"scene": req.params.sceneId})
    .then(str => {
      console.log(str);
      res.sendStatus(200);
    })
);

app.post('/light/:lightId/rgb/:r/:g/:b/:time?', (req, res) => {
  let transitionTime;
  if (req.params.time) transitionTime = parseInt(req.params.time);
  if (transitionTime === NaN) transitionTime = 4;

  const lightId = parseInt(req.params.lightId);

  const xy = Conversions.rgbToXy(
    parseInt(req.params.r),
    parseInt(req.params.g),
    parseInt(req.params.b),
  );

  HueAPI.request('PUT', `/lights/${lightId}/state`, {"xy": xy, "transitiontime": transitionTime})
    .then(() => res.sendStatus(200));
});

app.post('/light/:lightId/random/:time?', (req, res) => {
  let transitionTime;
  if (req.params.time) transitionTime = parseInt(req.params.time);
  if (transitionTime === NaN) transitionTime = 4;

  const lightId = parseInt(req.params.lightId);
  const r = Math.floor(Math.random() * 255);
  const g = Math.floor(Math.random() * 255);
  const b = Math.floor(Math.random() * 255);
  const xy = Conversions.rgbToXy(r, g, b);

  HueAPI.request('PUT', `/lights/${lightId}/state`, {"xy": xy, "transitiontime": transitionTime})
    .then(() => res.sendStatus(200));
});

app.post('/group/:groupId/cycle/:time?', (req, res) =>
  Promise.all([
    HueAPI.request('GET', `/groups/${req.params.groupId}`, {}),
    HueAPI.getLights(),
  ]).then(([group, allLights]) => {
    let transitionTime;
    if(req.params.time) transitionTime = parseInt(req.params.time);
    if(transitionTime === NaN) transitionTime = 4;
    const colourLightIdsInThisGroup = group.lights
      .filter(id => allLights[id].state.reachable && allLights[id].state.on && allLights[id].state.xy)
      .sort();

    return Promise.all(
      colourLightIdsInThisGroup.map((lightId, index) => {
        const nextLightId = colourLightIdsInThisGroup[(index + 1) % colourLightIdsInThisGroup.length];
        const xy = allLights[nextLightId].state.xy;
        HueAPI.request('PUT', `/lights/${lightId}/state`, {"xy": xy, "transitiontime": transitionTime});
      })
    );
  }).then(() => {
    res.sendStatus(200);
  })
);

app.put('/clock', (req, res) => {
  // if(req.body.years) { updateLight(13, req.body.years.rgb); }
  // if(req.body.months) { updateLight(12, req.body.months.rgb); }
  // if(req.body.days) { updateLight(11, req.body.days.rgb); }
  // if(req.body.hours) { updateLight(17, req.body.hours.rgb); }
  // if(req.body.minutes) { updateLight(15, req.body.minutes.rgb); }
  // if(req.body.seconds) { updateLight(14, req.body.seconds.rgb); }

  // DEMO
  // if(req.body.years) { updateLight(16, req.body.years.rgb); }
  // if(req.body.months) { updateLight(7, req.body.months.rgb); }
  // if(req.body.days) { updateLight(14, req.body.days.rgb); }
  // if(req.body.hours) { updateLight(13, req.body.hours.rgb); }
  // if(req.body.minutes) { updateLight(12, req.body.minutes.rgb); }
  // if(req.body.seconds) { updateLight(11, req.body.seconds.rgb); }

  res.sendStatus(200);
});

function updateLight(id, value) {
  let parse = /rgb\((\d+), (\d+), (\d+)\)/i.exec(value);
  let red = parse[1];
  let green = parse[2];
  let blue = parse[3];
  let xy = Conversions.rgbToXy(red, green, blue);

  return HueAPI.request('PUT', `/lights/${id}/state`, {"xy": xy});
}

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);