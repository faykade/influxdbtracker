const Influx = require('influx');
const express = require('express');
const http = require('http');
const os = require('os');
const session = require('express-session');
const app = express();
const bodyParser = require('body-parser');

const influx = new Influx.InfluxDB({
  database: 'final_pres',
  host: 'localhost',
  port: 8086,
  schema: [
    {
      measurement: 'page_visits',
      fields: {
        username: Influx.FieldType.STRING,
      },
      tags: [
        'page'
      ]
    }
  ]
})


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({
  secret: '1234-5678-9012345',
  resave: true,
  saveUninitialized: true
}));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());


influx.getDatabaseNames()
  .then(names => {
    if (!names.includes('final_pres')) {
      return influx.createDatabase('final_pres');
    }
  })
  .then(() => {
    http.createServer(app).listen(3000, function () {

      var sendPageStats = function(page,username){

        influx.writePoints([
          {
            measurement: 'page_visits',
            tags: { page: page },
            fields: { username: username },
          }
        ]).catch(err => {
          console.error(`Error saving data to InfluxDB! ${err.stack}`)
        })

        console.log("Sending page stats for: " + page);
      };

/*=============================================================================
 ACCOUNT AND GENERIC ROUTES
=============================================================================*/
      app.get('/login',function(req,res,next){
        res.render('create_account');
      })

      app.get('/', function(req,res){
        res.redirect("/login");
      });

      app.get('/logout',function(req,res){
        if(req.session.username){
          req.session.destroy();
        }
        res.redirect('/login');
      })

      app.post('/login', function(req, res, next){
        req.session.username = req.body.username;
        res.redirect('/secure/home');
      });

      app.use('/secure',function(req,res,next){
        if(!req.session.username){
          res.redirect("/login");
        }
        else{
          next();
        }
      });

/*=============================================================================
TRACKED PAGE ROUTES
=============================================================================*/
      app.get('/secure/products',function(req,res){
        sendPageStats('products', req.session.username);
        res.render('products', {product: ""});
      });

      app.get('/secure/products/:id',function(req,res){
        sendPageStats("product" + req.params.id, req.session.username);
        res.render('products', {product: req.params.id});
      })

      app.get('/secure/services',function(req,res){
        sendPageStats('services', req.session.username);
        res.render('services');
      });

      app.get('/secure/advice',function(req,res){
        sendPageStats('advice', req.session.username);
        res.render('advice');
      });

      app.get('/secure/home',function(req,res){
        sendPageStats('home', req.session.username);
        res.render('home');
      });

/*=============================================================================
 QUERY ROUTES
=============================================================================*/
      app.get('/query/all',function(req,res){
        if(req.query.username && req.query.limit && req.query.start && req.query.end && req.query.page){
          influx.query(`
            select * from page_visits
            where username = '${req.query.username}'
            and page = '${req.query.page}'
            and time > now() - ${req.query.start}m
            and time < now() - ${req.query.end}m
            order by time desc
            limit ${req.query.limit}
          `).then(result => {
            res.json(result)
          }).catch(err => {
            res.status(500).send(err.stack)
          })
        }
        else{
          res.render('q_all');
        }
      });

      app.get('/query/recent',function(req,res){
        influx.query(`
          select * from page_visits
          order by time desc
          limit 15
        `).then(result => {
          res.json(result)
        }).catch(err => {
          res.status(500).send(err.stack)
        })
      });

      app.get('/query/user',function(req,res){
        if(req.query.username && req.query.limit){
          influx.query(`
            select * from page_visits
            where username = '${req.query.username}'
            order by time desc
            limit ${req.query.limit}
          `).then(result => {
            res.json(result)
          }).catch(err => {
            res.status(500).send(err.stack)
          })
        }
        else{
          res.render('q_name');
        }
      })

      app.get('/query/time',function(req,res){
        if(req.query.start && req.query.end){
          influx.query(`
            select * from page_visits
            where time > now() - ${req.query.start}m
            and time < now() - ${req.query.end}m
            order by time desc
          `).then(result => {
            res.json(result)
          }).catch(err => {
            res.status(500).send(err.stack)
          })
        }
        else{
          res.render('q_time');
        }
      });

      app.get('/query/page',function(req,res){
        if(req.query.page && req.query.limit){
          influx.query(`
            select * from page_visits
            where page = '${req.query.page}'
            order by time desc
            limit ${req.query.limit}
          `).then(result => {
            res.json(result)
          }).catch(err => {
            res.status(500).send(err.stack)
          })
        }
        else{
          res.render('q_page');
        }
      });

    })
  })
  .catch(err => {
    console.error(`Error creating Influx database!`);
  })
