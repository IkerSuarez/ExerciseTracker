const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const shortid = require("shortid");
const moment = require("moment");

const app = express();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost/exercise-track' , 
                 {useNewUrlParser: true});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

//DB schema & model
const Schema = mongoose.Schema;
const userSchema = new Schema({
  username: { type: String, required: true },
  _id: { type: String },
  log: [
    {
      _id: false,
      description: String,
      duration: Number,
      date: { type: Date, default: Date.now }
    }
  ]
});
const userModel = mongoose.model("userModel", userSchema);


// Not found middleware
/*
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'});
});
*/

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})

app.post("/api/exercise/new-user", (req, res) => {
  const uName = req.body.username;
  const id = shortid.generate();
  if (uName) {
    userModel.findOne({ username: uName }, (err, user) => {
      if (err) console.log(err);
      if (!user) {
        const newUser = new userModel({
          username: uName,
          _id: id
        });
        newUser.save((err, data) => {
          err ? console.log(err) : res.json({ username: uName, _id: id });
        });
      } else {
        res.end("Username already taken");
      }
    });
  } else {
    res.end("No username given");
  }
});

app.post("/api/exercise/add", (req, res, next) => {
  const userId = req.body.userId;
  const description = req.body.description;
  const duration = req.body.duration;
  const date = req.body.date ? new Date(req.body.date) : new Date();
  userModel.findOne({ _id: userId }, (err, user) => {
    if (err) console.log(err);
    //Is the userId in the db?
    if (user) {
      //Is there a description in the request?
      if (description) {
        //Is there a duration in the request and is it a number?
        if (duration && !isNaN(duration)) {
          userModel.findOneAndUpdate(
            { _id: userId },
            { $push: { log: { description, duration, date } } },
            { new: true },
            (err, user) => {
              if (err) {
                next("A correct date is required");
              } else {
                res.json({
                  _id: userId,
                  description: description,
                  duration: duration,
                  date: moment.utc(date).format("ddd MMM DD YYYY")
                });
              }
            }
          );
        } else {
          next("A correct duration is required");
        }
      } else {
        next("A description is required");
      }
    } else {
      next("Invalid username");
    }
  });
});

app.get("/api/exercise/users", (req, res) => {
  userModel.find({}, { log: 0, __v: 0 }, (err, data) => {
    if (err) {
      console.log(err);
    }
    res.json(data);
  });
});

app.get("/api/exercise/log", (req, res, next) => {
  if (!req.query.userId) {
    next("A user id is required");
  }
  const formats = [moment.ISO_8601, "YYYY-MM-DD"];
  const userId = req.query.userId;
  let from, to;
  req.query.from == null
    ? (from = new Date(0))
    : moment.utc(req.query.from, formats, true).isValid()
    ? (from = new Date(req.query.from))
    : (from = "Invalid date");
  req.query.to == null
    ? (to = new Date())
    : moment.utc(req.query.to, formats, true).isValid()
    ? (to = new Date(req.query.to))
    : (to = "Invalid date");
  userModel.findOne({ _id: userId }, (err, data) => {
    if (err) {
      console.log(err);
    }
    if (data) {
      const limit = req.query.limit || data.log.length;
      const filtered = data.log
        .filter(elem => elem.date >= from && elem.date <= to)
        .slice(0, limit)
        .map(elem => ({
          description: elem.description,
          duration: elem.duration,
          date: moment.utc(elem.date).format("ddd MMM DD YYYY")
        }));
      res.json({
        _id: data._id,
        username: data.username,
        from: moment.utc(from).format("ddd MMM DD YYYY"),
        to: moment.utc(to).format("ddd MMM DD YYYY"),
        count: filtered.length,
        log: filtered
      });
    } else {
      next("Unknown id");
    }
  });
});
