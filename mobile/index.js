import React, {useEffect, useRef, useState} from 'react';
import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const config = Constants.expoConfig?.extra || {};
const origin = /^https:\/\/[\w.-]+(:\d+)?$/.test(config.origin) ? config.origin : '';
const trusted = url => url === origin || url.startsWith(origin + '/');

function App() {
  const web=useRef(null), canGoBack=useRef(false);
  const [path,setPath]=useState('/'), [error,setError]=useState('');
  function openAlert(response){
    const id=response?.notification.request.content.data?.alertId;
    if(typeof id==='string' && /^[\w-]{1,90}$/.test(id))setPath('/alertas/'+id);
  }
  useEffect(()=>{
    Notifications.getLastNotificationResponseAsync().then(openAlert).catch(()=>{});
    const listener=Notifications.addNotificationResponseReceivedListener(openAlert);
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(!canGoBack.current)return false;
      web.current?.goBack();return true;
    });
    return ()=>{listener.remove();back.remove();};
  },[]);
  async function message(event){
    if(!trusted(event.nativeEvent.url))return;
    let action;
    try{action=JSON.parse(event.nativeEvent.data);}catch{return;}
    const respond=(detail)=>web.current?.injectJavaScript('window.dispatchEvent(new CustomEvent("ayni-native",{detail:'+JSON.stringify({...detail,id:action.id})+'}));true;');
    try{
      if(action.type==='push'){
        if(!config.eas.projectId)throw Error('La aplicación requiere configuración de notificaciones.');
        if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('emergencias',{name:'Emergencias del sector',importance:Notifications.AndroidImportance.HIGH});
        if(!(await Notifications.requestPermissionsAsync()).granted)throw Error('Activa los avisos en los permisos del teléfono.');
        const token=await Notifications.getExpoPushTokenAsync({projectId:config.eas.projectId});
        respond({token:token.data});
      }else if(action.type==='location'){
        if(!(await Location.requestForegroundPermissionsAsync()).granted)throw Error('Activa la ubicación para continuar.');
        const {coords}=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
        respond({lat:coords.latitude,lng:coords.longitude});
      }
    }catch(e){respond({error:e.message});}
  }
  return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:'#F6F1E7'}}>
    {!origin || error ? <View style={{padding:24}}><Text accessibilityRole="header">Ayni</Text><Text>{error || 'Configura AYNI_ORIGIN con la dirección HTTPS de la comunidad al compilar.'}</Text>
      {error ? <Pressable accessibilityRole="button" onPress={()=>setError('')}><Text style={{padding:16}}>Reintentar</Text></Pressable>:null}</View> :
      <WebView ref={web} source={{uri:origin+path}} originWhitelist={[origin]} onShouldStartLoadWithRequest={r=>trusted(r.url)}
        onNavigationStateChange={s=>{canGoBack.current=s.canGoBack;}} onMessage={message} setSupportMultipleWindows={false}
        onError={()=>setError('No pudimos abrir Ayni. Comprueba la conexión y reintenta.')} />}
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(App);
