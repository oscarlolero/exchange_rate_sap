const cheerio = require('cheerio');
const axios = require('axios');
const moment = require('moment');
const fs = require('fs');
const nodemailer = require('nodemailer');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const serviceLayerURL = 'URLDESERVICELAYER:PUERTO';
const BANXICOToken = 'TOKENBANXICO';

init().then();



async function init() {
  const result = await updateSapRates();
  if(result.success) {
    const sentMailResult = sendMail(result);
  }
}

async function sendMail(data) {
  let mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'CORREO@gmail.com',
      pass: 'CONTRASEÑA'
    }
  });

  let mailDetails = {
    from: 'CORREO@gmail.com',
    to: 'CORREO@gmail.com',
    subject: `Actualización de divisas en SAP ${data.date}`,
    html: `<h3>Se actualizó correctamente USD y EUR</h3><p>USD: ${data.usd}, EUR: ${data.eur}</p>`
  };

  mailTransporter.sendMail(mailDetails, function(err, data) {
    if(err) {
      console.log('Problema al enviar el email', err);
    } else {
      console.log('Email enviado correctamente.');
    }
  });
}

async function updateSapRates() {
  try {
    let eurValue, usdValue;
    const today = moment().format('DD/MM/YYYY');
    const sapDate = moment().format('YYYYMMDD');
    const response = await axios.get('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF46410,SF43718/datos/oportuno', {
      headers: {
        'Bmx-Token': BANXICOToken
      }
    });

    response.data.bmx.series.forEach((element) => {
      if(element.idSerie === 'SF46410') {
        eurValue = element.datos[0].dato;
      } else if(element.idSerie === 'SF43718') {
        usdValue = element.datos[0].dato;
      }
    });
    console.log(`VALORES BANXICO: USD: ${usdValue}, EUR: ${eurValue}`);

    //SAP
      const SAPLoginResponse = await axios.post(`https://${serviceLayerURL}/b1s/v1/Login`, {
        "CompanyDB": "SBODemoMX",
        "UserName": "manager",
        "Password": "oscar0001",
      });
      const cookie = SAPLoginResponse.headers['set-cookie'];
      //Set currency USD
      let SAPResponse = await axios.post(`https://${serviceLayerURL}/b1s/v1/SBOBobService_SetCurrencyRate`, {
          "Currency": "usd",
          "RateDate": sapDate,
          "Rate": usdValue
        },
        {
          headers: {
            "Cookie": cookie
          }
        }
      );
      if(SAPResponse.status === 204) {
        console.log('Se actualizó correctamente tipo de cambio en SAP BUSINESS ONE');
      }
      //Set currency EUR
      SAPResponse = await axios.post(`https://${serviceLayerURL}/b1s/v1/SBOBobService_SetCurrencyRate`, {
          "Currency": "eur",
          "RateDate": sapDate,
          "Rate": eurValue
        },
        {
          headers: {
            "Cookie": cookie
          }
        }
      );
      if(SAPResponse.status === 204) {
        console.log('Se actualizó correctamente tipo de cambio en SAP BUSINESS ONE');
      }
      //Get currency USD
      SAPResponse = await axios.post(`https://${serviceLayerURL}/b1s/v1/SBOBobService_GetCurrencyRate`, {
          "Currency": "usd",
          "Date": sapDate
        },
        {
          headers: {
            "Cookie": cookie
          }
        }
      );
      console.log(`Valor recuperado USD del día ${today} desde de SAP BUSINESS ONE: ${SAPResponse.data}`);
      //Get currency EUR
      SAPResponse = await axios.post(`https://${serviceLayerURL}/b1s/v1/SBOBobService_GetCurrencyRate`, {
          "Currency": "eur",
          "Date": sapDate
        },
        {
          headers: {
            "Cookie": cookie
          }
        }
      );
      console.log(`Valor EUR recuperado del día ${today} desde de SAP BUSINESS ONE: ${SAPResponse.data}`);
      await axios.post(`https://${serviceLayerURL}/b1s/v1/Logout`);
      return {
        success: true,
        usd: usdValue,
        eur: eurValue,
        date: today
      };
  } catch (e) {
    console.error('ERROR:');
    console.error(e.response.data);
    return {
      success: false
    };
  }
}
