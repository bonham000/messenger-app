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
} from "react-native";

/** ==============================================================================
 * Config
 * ===============================================================================
 */

const NAME_KEY = "NAME_KEY";

/**
 * background session timeout is 25 minutes to account for Heroku dynos sleeping
 */
const BACKGROUND_TIMEOUT = 25 * 60 * 1000;

const DEV = "development";
const DEV_URL = "http://192.168.1.129:8000";
const DEV_WS_URI = "ws://192.168.1.129:9001";

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
     * Add listener to AppState to detect app foreground/background actions
     */
    AppState.addEventListener("change", this.handleAppStateChange);

    /**
     * Initialize the chat
     */
    this.initializeMessageHistory();
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

  render() {
    if (this.state.loadingName) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.title}>Choose a name</Text>
          <TextInput
            placeholder="Who are you?"
            value={this.state.nameInput}
            onChangeText={this.setNameInput}
            style={{ ...styles.textInput, width: "90%" }}
          />
          <Button onPress={this.setName} title="Save" />
        </View>
      );
    } else if (this.state.loading || this.state.checkingForUpdate) {
      return (
        <View style={styles.fallback}>
          <ActivityIndicator color="rgb(255,62,54)" size="large" />
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
              if (this.state.messages.length > 15) {
                this.scrollChatHistory();
              }
            }}
            onContentSizeChange={this.scrollChatHistory}
            data={this.state.messages.map(m => ({ message: m, key: m.uuid }))}
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
              value={this.state.input}
              placeholder={`Type a message, ${this.state.name}`}
              onChangeText={(text: string) => this.setState({ input: text })}
            />
            <Button
              onPress={
                this.state.editingMessage ? this.editMessage : this.postMessage
              }
              title={`${
                this.state.requestInProgress
                  ? "Processing..."
                  : this.state.editingMessage
                  ? "Edit"
                  : "Send"
              } Message`}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

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
    this.setState(handleSaveMessage(message));
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
            text: "Dismiss",
          },
        ],
        { cancelable: false },
      );
    }
  };

  initializeWebSocketConnection = () => {
    /**
     * Close any existing connection
     */
    if (this.socket) {
      try {
        this.socket.close();
        this.socket = null;
      } catch (_) {
        // no-op
      }
    }

    try {
      console.log("Initializing socket connection at: ", WEBSOCKET_URI);

      // @ts-ignore
      this.socket = new WebSocket(WEBSOCKET_URI);

      /**
       * Open Socket connection
       */
      this.socket.addEventListener(
        "open",
        (_: any) => {
          console.log("Socket listener opened");
        },
        (error: any) => {
          console.log(`Error opening WebSockets listener: ${error}`);
        },
      );

      this.socket.addEventListener("onclose", () => null);

      /**
       * Listen for messages
       */
      this.socket.addEventListener("message", (event: any) => {
        this.handleSocketMessage(event.data);
      });
    } catch (err) {
      console.log("Error initializing web socket connection", err);
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
}

/** ==============================================================================
 * State Helpers
 * ===============================================================================
 */

const handleSaveMessage = (message: Message) => (prevState: IState) => {
  const maybeExists = prevState.messages.find(m => m.id === message.id);
  return {
    input: "",
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
