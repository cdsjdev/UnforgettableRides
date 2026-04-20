import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { messagingAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// Screens
import HomeScreen from '../screens/HomeScreen';
import CarListScreen from '../screens/CarListScreen';
import CarDetailScreen from '../screens/CarDetailScreen';
import BookingScreen from '../screens/BookingScreen';
import MessagesScreen from '../screens/MessagesScreen';
import MessageThreadScreen from '../screens/MessageThreadScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BookingsListScreen from '../screens/BookingsListScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import HelpScreen from '../screens/HelpScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const GOLD = '#c9a84c';
const BG = '#0d0d0d';
const SURFACE = '#1a1a1a';
const INACTIVE_TAB = '#8c8576';

// ---- Param lists ----

export type HomeStackParamList = {
  HomeMain: undefined;
  CarDetail: { carId: string; car?: any };
  BookCar: { carId: string; car?: any };
};

export type CarsStackParamList = {
  CarsMain: { tag?: string } | undefined;
  CarDetail: { carId: string; car?: any };
  BookCar: { carId: string; car?: any };
};

export type MessagesStackParamList = {
  MessagesMain: undefined;
  MessageThread: { threadId: string; displayName?: string; ownerId?: string; carTitle?: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  BookingsList: undefined;
  MyListings: undefined;
  Login: undefined;
  Register: { role?: string } | undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  Help: undefined;
  Feedback: undefined;
  Notifications: undefined;
};

export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Cars: NavigatorScreenParams<CarsStackParamList>;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

// ---- Navigators ----

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CarsStack = createNativeStackNavigator<CarsStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// ---- Shared header options ----

const screenOptions = {
  headerStyle: { backgroundColor: SURFACE },
  headerTintColor: '#f0ebe0',
  headerTitleStyle: { fontWeight: '600' as const },
  headerBackTitle: '',
  animation: 'slide_from_right' as const,
};

// ---- Stacks ----

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ title: 'UnforgettableRides', headerShown: false }} />
      <HomeStack.Screen name="CarDetail" component={CarDetailScreen} options={{ title: 'Car Details' }} />
      <HomeStack.Screen name="BookCar" component={BookingScreen} options={{ title: 'Request Booking' }} />
    </HomeStack.Navigator>
  );
}

function CarsStackNavigator() {
  return (
    <CarsStack.Navigator screenOptions={screenOptions}>
      <CarsStack.Screen name="CarsMain" component={CarListScreen} options={{ title: 'Browse Cars' }} />
      <CarsStack.Screen name="CarDetail" component={CarDetailScreen} options={{ title: 'Car Details' }} />
      <CarsStack.Screen name="BookCar" component={BookingScreen} options={{ title: 'Request Booking' }} />
    </CarsStack.Navigator>
  );
}

function MessagesStackNavigator() {
  return (
    <MessagesStack.Navigator screenOptions={screenOptions}>
      <MessagesStack.Screen name="MessagesMain" component={MessagesScreen} options={{ title: 'Messages' }} />
      <MessagesStack.Screen name="MessageThread" component={MessageThreadScreen} options={({ route }) => ({ title: (route.params as any)?.displayName || 'Message' })} />
    </MessagesStack.Navigator>
  );
}

function MyListingsPlaceholder({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="car-outline" size={48} color="#7a7365" />
      <Text style={{ color: '#b1a998', fontSize: 16, marginTop: 12 }}>My Listings coming soon</Text>
    </View>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={screenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile', headerShown: false }} />
      <ProfileStack.Screen name="BookingsList" component={BookingsListScreen} options={{ title: 'My Bookings' }} />
      <ProfileStack.Screen name="MyListings" component={MyListingsPlaceholder} options={{ title: 'My Listings' }} />
      <ProfileStack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In', headerShown: false }} />
      <ProfileStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account', headerShown: false }} />
      <ProfileStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Forgot Password', headerShown: false }} />
      <ProfileStack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Reset Password', headerShown: false }} />
      <ProfileStack.Screen name="Help" component={HelpScreen} options={{ title: 'Help' }} />
      <ProfileStack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback' }} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
    </ProfileStack.Navigator>
  );
}

// ---- Root Tab Navigator ----

function TabBarLabel({ focused, label }: { focused: boolean; label: string }) {
  return <Text style={{ color: focused ? GOLD : INACTIVE_TAB, fontSize: 11, marginTop: -2 }}>{label}</Text>;
}

export function AppNavigator() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const refresh = () => {
      messagingAPI.getUnreadCount().then(n => setUnreadCount(n)).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: SURFACE,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INACTIVE_TAB,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={focused ? GOLD : INACTIVE_TAB} />,
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused} label="Home" />,
        }}
      />
      <Tab.Screen
        name="Cars"
        component={CarsStackNavigator}
        options={{
          tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'car-sport' : 'car-sport-outline'} size={size} color={focused ? GOLD : INACTIVE_TAB} />,
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused} label="Cars" />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStackNavigator}
        options={{
          tabBarIcon: ({ focused, size }) => (
            <View>
              <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={focused ? GOLD : INACTIVE_TAB} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused} label="Messages" />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={focused ? GOLD : INACTIVE_TAB} />,
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused} label="Profile" />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
