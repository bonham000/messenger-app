import { Updates } from "expo";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AsyncStorage,
  Button,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  YellowBox,
} from "react-native";
import io from "socket.io-client";

import { ShakeEventExpo } from "./ShakeEvent";

console.ignoredYellowBox = ["Remote debugger"];
YellowBox.ignoreWarnings([
  "Unrecognized WebSocket connection option(s) `agent`, `perMessageDeflate`, `pfx`, `key`, `passphrase`, `cert`, `ca`, `ciphers`, `rejectUnauthorized`. Did you mean to put these under `headers`?",
]);

/** ==============================================================================
 * Config
 * ===============================================================================
 */

const NAME_KEY = "NAME_KEY";

/**
 * background session timeout is 25 minutes to account for Heroku dynos sleeping
 */
const BACKGROUND_TIMEOUT = 25 * 60 * 1000;

const DEV = "developmentz";
const DEV_URL = "http://192.168.1.129:8000";
// Rocket
// const DEV_WS_URI = "ws://127.0.0.1:3012";
// Node-Socket
const DEV_WS_URI = "ws://127.0.0.1:9001";

const PROD_URL = "https://shrouded-coast-91311.herokuapp.com";
const PROD_WS_URI = "ws://calm-plateau-50109.herokuapp.com/";

// @ts-ignore
const BACKEND_URI = process.env.NODE_ENV === DEV ? DEV_URL : PROD_URL;
// @ts-ignore
const WEBSOCKET_URI = process.env.NODE_ENV === DEV ? DEV_WS_URI : PROD_WS_URI;

/** ==============================================================================
 * Types
 * ===============================================================================
 */

interface Message {
  id: number;
  uuid: string;
  message: string;
  author: string;
}

enum MessageBroadcastType {
  NEW = "NEW",
  EDIT = "EDIT",
  DELETE = "DELETE",
}

interface MessageBroadcast {
  message: Message;
  message_type: MessageBroadcastType;
}

interface IState {
  name: string;
  input: string;
  appState: string;
  loading: boolean;
  nameInput: string;
  loadingName: boolean;
  editingMessage: boolean;
  editName: boolean;
  editMessageData?: Message;
  requestInProgress: boolean;
  checkingForUpdate: boolean;
  messages: ReadonlyArray<Message>;
  backgroundSessionStart: number;
}

const HTTP = {
  GET: { method: "GET" },
  PUT: { method: "PUT" },
  POST: { method: "POST" },
  DELETE: { method: "DELETE" },
};

/** ==============================================================================
 * App
 * ===============================================================================
 */

export default class App extends React.Component<{}, IState> {
  socket: any;
  chatHistory: any;

  constructor(props: {}) {
    super(props);

    this.state = {
      input: "",
      appState: "",
      loading: true,
      editName: false,
      loadingName: true,
      messages: [],
      name: "",
      nameInput: "",
      requestInProgress: false,
      checkingForUpdate: true,
      editingMessage: false,
      backgroundSessionStart: 0,
    };
  }

  async componentDidMount() {
    /**
     * Check for any app updates
     */
    this.checkForAppUpdate();

    /**
     * Restore user name if it exists
     */
    this.maybeRestoreName();

    /**
     * Initialize the chat
     */
    this.initializeMessageHistory();

    /**
     * Add shake listener
     */
    ShakeEventExpo.addListener(this.handleShake);

    /**
     * Add listener to AppState to detect app foreground/background actions
     */
    AppState.addEventListener("change", this.handleAppStateChange);
  }

  componentWillUnmount() {
    this.shutdownSocketConnection();
    ShakeEventExpo.removeListener();
  }

  render() {
    const {
      input,
      loading,
      editName,
      loadingName,
      messages,
      name,
      nameInput,
      checkingForUpdate,
      editingMessage,
    } = this.state;

    if (loadingName) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.title}>
            {editName ? "Edit your" : "Choose a"} name
          </Text>
          <TextInput
            placeholder="Who are you?"
            value={nameInput}
            onChangeText={this.setNameInput}
            style={{ ...styles.textInput, width: "90%" }}
          />
          <Button onPress={this.setName} title="Save" />
        </View>
      );
    } else if (loading || checkingForUpdate) {
      return (
        <View style={styles.fallback}>
          <ActivityIndicator color={ROCKET_RED} size="large" />
        </View>
      );
    }

    return (
      <KeyboardAvoidingView style={styles.container} behavior="padding" enabled>
        <View style={styles.innerContainer}>
          <View style={styles.center}>
            <Text style={styles.title}>Rocket Messenger 🚀</Text>
          </View>
          <FlatList
            ref={this.assignChatRef}
            onLayout={() => {
              if (messages.length > 15) {
                this.scrollChatHistory();
              }
            }}
            onContentSizeChange={this.scrollChatHistory}
            data={messages.map(m => ({ message: m, key: m.uuid }))}
            contentContainerStyle={{ width: "100%" }}
            renderItem={({ item }) => {
              const { message } = item;
              return (
                <TouchableOpacity
                  onPress={this.handleTapMessage(message)}
                  style={styles.message}
                >
                  <Text
                    style={{ width: "100%", fontWeight: "bold" }}
                    key={item.key}
                  >
                    {message.author}:{" "}
                    <Text style={{ fontWeight: "normal" }} key={item.key}>
                      {message.message}
                    </Text>
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <View style={styles.center}>
            <TextInput
              style={styles.textInput}
              value={input}
              placeholder={`Type a message, ${name}`}
              onChangeText={(text: string) => this.setState({ input: text })}
            />
            <Button
              onPress={editingMessage ? this.editMessage : this.postMessage}
              title={`${editingMessage ? "Edit" : "Send"} Message`}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  initializeMessageHistory = async () => {
    /**
     * Initialize web socket connection
     */
    this.initializeWebSocketConnection();

    /**
     * Fetch existing messages
     */
    this.getMessages();
  };

  setNameInput = (nameInput: string) => {
    this.setState({ nameInput });
  };

  setName = async () => {
    const { nameInput } = this.state;
    if (nameInput) {
      await AsyncStorage.setItem(NAME_KEY, JSON.stringify({ name: nameInput }));
      this.setState({
        name: nameInput,
        nameInput: "",
        loadingName: false,
      });
    }
  };

  maybeRestoreName = async () => {
    let name = "";
    try {
      const rawName = (await AsyncStorage.getItem("NAME_KEY")) || "";
      name = JSON.parse(rawName).name;
    } catch (err) {
      // no-op
    }

    this.setState({ name, loadingName: !Boolean(name) });
  };

  handleShake = () => {
    this.setState(prevState => ({
      loadingName: true,
      editName: true,
      nameInput: prevState.name,
    }));
  };

  handleSocketMessage = (data: string) => {
    const messageBroadcast: MessageBroadcast = JSON.parse(data);

    const { message, message_type } = messageBroadcast;
    console.log(`New socket message received ==> ${data}`);
    switch (message_type) {
      case MessageBroadcastType.NEW: {
        this.handleSaveMessageUpdate(message);
        break;
      }
      case MessageBroadcastType.EDIT: {
        this.handleEditMessageUpdate(message);
        break;
      }
      case MessageBroadcastType.DELETE: {
        this.handleDeleteMessageUpdate(message);
        break;
      }
      default: {
        console.log(`Unexpected message type received: ${message_type}`);
      }
    }
  };

  broadcastMessage = (type: MessageBroadcastType, message: Message) => {
    const data = JSON.stringify({
      message,
      message_type: type,
    });
    console.log("Broadcasting message over WebSockets... ", data);
    try {
      this.socket.send(data);
    } catch (err) {
      console.log("Error sending websockets message broadcast", err);
    }
  };

  handleSaveMessageUpdate = (message: Message) => {
    this.setState(handleSaveMessage(message, false));
  };

  handleEditMessageUpdate = (message: Message) => {
    this.setState(handleEditMessage(message));
  };

  handleDeleteMessageUpdate = (message: Message) => {
    this.setState(handleDeleteMessage(message.id));
  };

  getMessages = async () => {
    this.setState(
      {
        loading: true,
        messages: [],
      },
      async () => {
        try {
          const result = await fetch(`${BACKEND_URI}/messages`, HTTP.GET);
          const response = await result.json();
          this.setState({
            loading: false,
            messages: response,
          });
        } catch (err) {
          this.handleError("GET", err);
        }
      },
    );
  };

  postMessage = async () => {
    if (this.state.input && !this.state.requestInProgress) {
      this.setState(
        {
          requestInProgress: true,
        },
        async () => {
          try {
            const result = await fetch(`${BACKEND_URI}/message`, {
              ...HTTP.POST,
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: this.state.input,
                author: this.state.name,
              }),
            });
            const newMessage = await result.json();
            this.setState(handleSaveMessage(newMessage), () => {
              this.broadcastMessage(MessageBroadcastType.NEW, newMessage);
            });
          } catch (err) {
            this.handleError("POST", err);
          }
        },
      );
    }
  };

  editMessage = async () => {
    if (!this.state.requestInProgress) {
      this.setState(
        {
          requestInProgress: true,
        },
        async () => {
          try {
            const message = {
              ...this.state.editMessageData,
              message: this.state.input,
              author: "Seanie X",
            };
            const result = await fetch(`${BACKEND_URI}/message`, {
              ...HTTP.PUT,
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(message),
            });
            const response: Message = await result.json();
            this.setState(handleEditMessage(response), () => {
              this.broadcastMessage(MessageBroadcastType.EDIT, response);
            });
          } catch (err) {
            this.handleError("PUT", err);
          }
        },
      );
    }
  };

  deleteMessage = async (message: Message) => {
    if (!this.state.requestInProgress) {
      this.setState(
        {
          requestInProgress: true,
        },
        async () => {
          try {
            await fetch(`${BACKEND_URI}/message/${message.id}`, HTTP.DELETE);
            this.setState(handleDeleteMessage(message.id), () => {
              this.broadcastMessage(MessageBroadcastType.DELETE, message);
            });
          } catch (err) {
            this.handleError("DELETE", err);
          }
        },
      );
    }
  };

  handleError = (method: "GET" | "PUT" | "POST" | "DELETE", err: any) => {
    console.log(`Error for ${method} method: `, err);
  };

  handleTapMessage = (message: Message) => () => {
    if (!this.state.requestInProgress && this.state.name === message.author) {
      Alert.alert(
        "Options",
        "You can edit or delete",
        [
          {
            text: "Edit",
            style: "cancel",
            onPress: () => {
              this.setState({
                editingMessage: true,
                editMessageData: message,
                input: message.message,
              });
            },
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => this.deleteMessage(message),
          },
          {
            text: "Cancel",
          },
        ],
        { cancelable: false },
      );
    }
  };

  initializeWebSocketConnection = () => {
    this.shutdownSocketConnection();

    try {
      console.log(
        `Trying to initialize socket connection at: ${WEBSOCKET_URI}`,
      );

      this.socket = io(WEBSOCKET_URI);

      /**
       * Open Socket connection
       */
      this.socket.on(
        "connect",
        (_: any) => {
          console.log("Socket listener opened");
        },
        (error: any) => {
          console.log(`Error opening WebSockets listener: ${error}`);
        },
      );

      this.socket.on("disconnect", () => {
        console.log("Socket connection closed");
      });

      /**
       * Listen for messages
       */
      this.socket.on("update", (event: string) => {
        this.handleSocketMessage(event);
      });
    } catch (err) {
      console.log("Error initializing web socket connection", err);
    }
  };

  shutdownSocketConnection = () => {
    /**
     * Close any existing connection
     */
    try {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    } catch (_) {
      // no-op
    }
  };

  handleAppStateChange = (nextAppState: string) => {
    if (
      this.state.appState.match(/inactive|background/) &&
      nextAppState === "active"
    ) {
      this.checkForAppUpdate();

      const time = now();
      const backgroundTime = time - this.state.backgroundSessionStart;
      if (backgroundTime > BACKGROUND_TIMEOUT) {
        /**
         * Only do this if app has been background for more than 30 minutes
         */
        this.initializeMessageHistory();
      }
    } else {
      this.setState({
        backgroundSessionStart: now(),
      });
    }

    this.setState({ appState: nextAppState });
  };

  assignChatRef = (ref: any) => {
    this.chatHistory = ref;
  };

  scrollChatHistory = () => {
    try {
      this.chatHistory.scrollToEnd({ animated: true });
    } catch (_) {
      // no-op
    }
  };

  checkForAppUpdate = async (): Promise<void> => {
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync();
      if (isAvailable) {
        Alert.alert(
          "Update Available!",
          "Confirm to update now",
          [
            {
              text: "Cancel",
              onPress: () => {
                this.setState({ checkingForUpdate: false });
              },
              style: "cancel",
            },
            { text: "OK", onPress: this.updateApp },
          ],
          { cancelable: false },
        );
      } else {
        this.setState({ checkingForUpdate: false });
      }
    } catch (err) {
      this.setState({ checkingForUpdate: false });
    }
  };

  updateApp = () => {
    try {
      this.setState(
        {
          loading: true,
        },
        async () => {
          await Updates.fetchUpdateAsync();
          Updates.reloadFromCache();
        },
      );
      // tslint:disable-next-line
    } catch (err) {}
  };

  // setHeartbeat = () => {
  //   clearTimeout(this.pingTimeout);

  //   this.pingTimeout = setTimeout(() => {
  //     this.terminate();
  //   }, 30000 + 1000);
  // }
}

/** ==============================================================================
 * State Helpers
 * ===============================================================================
 */

const handleSaveMessage = (message: Message, clearInput: boolean = true) => (
  prevState: IState,
) => {
  const maybeExists = prevState.messages.find(m => m.id === message.id);
  return {
    input: clearInput ? "" : prevState.input,
    requestInProgress: false,
    messages: maybeExists
      ? prevState.messages
      : prevState.messages.concat(message),
  };
};

const handleEditMessage = (message: Message) => (prevState: IState) => ({
  input: "",
  requestInProgress: false,
  editingMessage: false,
  editMessageData: undefined,
  messages: prevState.messages.map(m => {
    return m.id === message.id ? message : m;
  }),
});

const handleDeleteMessage = (id: number) => (prevState: IState) => ({
  input: "",
  requestInProgress: false,
  messages: prevState.messages.filter(m => m.id !== id),
});

const now = () => Date.now();

/** ==============================================================================
 * Styles
 * ===============================================================================
 */

const ROCKET_RED = "rgb(255,62,54)";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
  },
  innerContainer: {
    flex: 1,
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 30,
  },
  fallback: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  center: {
    alignItems: "center",
    width: "100%",
  },
  title: {
    marginTop: 20,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: "bold",
  },
  message: {
    width: "90%",
    marginTop: 7,
    marginBottom: 7,
  },
  input: {
    marginBottom: 40,
    paddingLeft: 15,
    height: 40,
    borderRadius: 20,
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  textInput: {
    marginVertical: 15,
    padding: 12,
    height: 40,
    width: "100%",
    borderWidth: 1,
    fontSize: 14,
    borderColor: "rgba(50,50,50,0.5)",
  },
});
