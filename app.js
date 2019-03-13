const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');
var model;
const load = async () => {
    model = await tf.loadModel('file://model/model.json');
};
load();

const request = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var mongojs = require('./db');
var fs = require('fs');
var csv = require('fast-csv');
var csvfile = __dirname + "/sanam.csv"

var db = mongojs.connect;
var app = express();
app.use(bodyParser.json());

var pINvalueHW = 0;
var pOUTvalueHW = 0;
var pAllHW = 0;

var pINvalue = 0;
var pOUTvalue = 0;
var pAll = 0;

var sendState = 0;

app.get('/', function (req, res) {
  res.send("Sample Code for RESTful API");
})

app.get('/predict', function (req, res1) {
  var json;
  console.log("Start predicting...");
  request.get({
        url: 'http://202.139.192.92:8080/getSanam/7',
    },(err,res,body)=>{
        let server_data = JSON.parse(body) ;
        let xx =[];
        var num = [];
        xx[0]=server_data.number_of_tourist;
        for(index=0;index<7;index++)
        {
            xx[0][index]=xx[0][index]/1801;
        }
        xxx=tf.tensor2d(xx);
        xxx = tf.reshape(xxx, [-1, 7, 1]);

        const r = model.predict(xxx);
        let result = r.dataSync();
        for(index=0;index<result.length;index++)
        {
            result[index]=result[index]*1801;
            num.push(result[index]);
        }
        json = { number_of_tourist: num };
        console.log("Predict result");
        console.log(json);
        res1.send(json);
    });
})

//Sent number of tourists to ML
app.get('/getSanam/:num', function (req, res) {
  var num_of_tourist = [];
  var number = parseInt(req.params.num);
  console.log("Sent number of tourist to ML");
  db.NumData.find().sort({_id:-1}).limit(number, function(err, docs) {

    for(var i = 0; i<number; i++){
      num_of_tourist.push(docs[i].number_of_tourist);
    }
    var json = {number_of_tourist: num_of_tourist}
    console.log(num_of_tourist);
    res.send(json);
  });

})

//Get data from Line
app.post('/putSanam', function (req, res) {
  console.log(req.body)
  var getDate = Date(req.body.beacon.dateTime)
  var bDateTime = JSON.stringify(getDate);
  var bStatus = req.body.beacon.status;
  console.log(bDateTime);
  console.log(bStatus);

  if(bStatus == "enter"){
    pINvalue++;
    pAll++;
  }else if(bStatus == "leave"){
    if(pAll>0&&pINvalue>0){
      pAll--; pOUTvalue++;
    }else{
      console.log("ERROR");
    }
  }

  var json = {
    P_IN: pINvalue,
    P_OUT: pOUTvalue,
    timestamp: bDateTime
  };

  if((pINvalue - pOUTvalue) >= 2){
    var json_text = { text: "DANGER" };
    res.send(json_text);
  }else{
    var json_text = { text: "NORMAL" };
    res.send(json_text);
  }

  db.BeaconData.insert(json, function (err, docs) {
    console.log("Seccessfully get Data from LINE beacon");
    console.log(docs);
  });
})

//Sent lastest data
app.get('/adminMon', function (req, res) {
  console.log("Sent lastest data from HW to LINE");
  db.SensorData.find({}).sort({_id:-1}).toArray(function(err, docs) {
    var lastData = docs[0];
    console.log(lastData);
    res.send(lastData);
  });
})

//Get data from HW
app.post('/receiveData', function (req, res) {
  //timestamp
  var now = new Date();
  var date = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  var time = JSON.stringify(date);
  console.log(time);

  //split data from HW
  var payload = req.body.DevEUI_uplink.payload_hex;

  var tempCode = payload.substr(0, 8);
  var humidCode = payload.substr(8, 8);
  var pINcode = payload.substr(16, 8);
  var pOUTcode = payload.substr(24, 8);

  var tempTdata = tempCode.substr(4, 4);
  var tempData = parseFloat(parseInt(tempTdata, 16)/100);
  //console.log(tempData);

  var humidTdata = humidCode.substr(4, 4);
  var humidData = parseFloat(parseInt(humidTdata, 16)/100);
  //console.log(humidData);

  var pinTdata = pINcode.substr(4, 4);
  var pINdata = parseInt(pinTdata, 16);
  //console.log(humidTdata);
  //console.log(pINdata);

  var poutTdata = pOUTcode.substr(4, 4);
  var pOUTdata = parseInt(poutTdata, 16);
  //console.log(humidTdata);
  //console.log(pOUTdata);


  if(pOUTvalueHW <= pINvalueHW) {
    pINvalueHW += pINdata;
    pOUTvalueHW += pOUTdata;
    pAllHW = pINvalueHW - pOUTvalueHW;
  }else{
    console.log("ERROOOOOOOOOR");
  }

  console.log(pAll);

  var json = {
    Temperature: tempData,
    Humidity: humidData,
    P_IN:  pINvalueHW,
    P_OUT: pOUTvalueHW,
    timestamp: time
  };

  //console.log(json);
  db.SensorData.insert(json, function (err, docs) {
    console.log("Seccessfully get Data from HW");
    console.log(docs);
    res.send(docs);
  });
})

var server = app.listen(8080, function () {
  var port = server.address().port

  db.SensorData.find().sort({_id:-1}).toArray(function(err, doc) {
    if (doc[0] != null) {
      console.log("Find SensorData");
      pINvalueHW = doc[0].P_IN;
      pOUTvalueHW = doc[0].P_OUT;
      pAllHW = pINvalueHW - pOUTvalueHW;
    } else {
      console.log('No data in SensorData at the time');
    }
  });

  db.BeaconData.find().sort({_id:-1}).toArray(function(err, doc) {
    if (doc[0] != null) {
      console.log("Find BeaconData");
      pINvalue = doc[0].P_IN;
      pOUTvalue = doc[0].P_OUT;
      pAll = pINvalue - pOUTvalue;
    } else {
      console.log('No data in BeaconData at the time');
    }
  });

  db.NumData.find({}).sort({_id:-1}).toArray(function(err, doc) {
    if (doc[0] != null) {} else {
      console.log('Inserting Datas');
      var json;
      var array = [];
      var num = [];
      csv.fromPath(csvfile)
        .on("data", function (data) {
            //fileRows.push(data)
            array = String(data).split(";")
            var date = array[0];
            array = array.splice(1, 24);
            for(var i in array){
              num.push(array[i])
            }
        })
        .on("end", function () {
          for(var i in num){
            json = { number_of_tourist:num[i] };
            db.NumData.insert(json, function (err, docs) {});
          }

        })
        .on("error", function(error) {
            console.log(error.message);
        });
      }
    });

    var d = new Date();
    var n = d.getHours();
    if(parseInt(n)>=5 && parseInt(n)<=20){
      console.log("Start sending data...");
      sendState = 1;
      var intervalObject = setInterval(function () {
        json = {
          number_of_tourist: String(pAll)
        };
        db.NumData.insert(json, function (err, docs) {
          console.log("Insert tourist number " + pAll);
        });
      }, 3600000);
    }else{
      console.log("Stop sending data...");
      sendState = 0;
      clearInterval(intervalObject);
    }
})
