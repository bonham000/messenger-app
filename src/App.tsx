import React from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

/** ******************************************************************************
 * Config
 * ********************************************************************************
 */

const DEV_WEBSOCKET_URI = "ws://172.16.0.137:3012";
const PROD_WEBSOCKET_URI = "ws://shrouded-coast-91311.herokuapp.com:3012";
const DEV_URL = "http://172.16.0.137:8000/";
const PROD_URL = "https://shrouded-coast-91311.herokuapp.com";

const BACKEND_URI =
  // @ts-ignore
  process.env.NODE_ENV === "development" ? DEV_URL : PROD_URL;
const WEBSOCKET_URI =
  // @ts-ignore
  process.env.NODE_ENV === "development"
    ? DEV_WEBSOCKET_URI
    : PROD_WEBSOCKET_URI;

/** ******************************************************************************
 * Types
 * ********************************************************************************
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
  input: string;
  appState: string;
  loading: boolean;
  editingMessage: boolean;
  editMessageData?: Message;
  messages: ReadonlyArray<Message>;
}

const HTTP = {
  GET: { method: "GET" },
  PUT: { method: "PUT" },
  POST: { method: "POST" },
  DELETE: { method: "DELETE" },
};

/** ******************************************************************************
 * App
 * ********************************************************************************
 */

export default class App extends React.Component<{}, IState> {
  socket: any;

  constructor(props: {}) {
    super(props);

    this.state = {
      input: "",
      appState: "",
      loading: true,
      messages: [],
      editingMessage: false,
    };
  }

  async componentDidMount() {
    /**
     * Add listener to AppState to detect app foreground/background actions.
     */
    AppState.addEventListener("change", this.handleAppStateChange);

    /**
     * Initialize web socket connection
     */
    this.initializeWebSocketConnection();

    /**
     * Fetch existing messages
     */
    this.getMessages();
  }

  render() {
    if (this.state.loading) {
      return (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator color="blue" size="large" />
        </View>
      );
    }

    return (
      <KeyboardAwareScrollView>
        <View style={styles.container}>
          <Text style={{ margin: 20, fontSize: 18, fontWeight: "bold" }}>
            Message History:
          </Text>
          <FlatList
            contentContainerStyle={{ width: "100%" }}
            data={this.state.messages.map(m => ({ message: m, key: m.uuid }))}
            renderItem={({ item }) => {
              const { message } = item;
              return (
                <TouchableOpacity
                  onPress={this.handleTapMessage(message)}
                  style={{ width: "100%", marginTop: 7, marginBottom: 7 }}
                >
                  <Text style={{ fontWeight: "bold" }} key={item.key}>
                    {message.author}:{" "}
                    <Text style={{ fontWeight: "normal" }} key={item.key}>
                      {message.message}
                    </Text>
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <TextInput
            style={styles.textInput}
            placeholder="Type a new message"
            value={this.state.input}
            onChangeText={(text: string) => this.setState({ input: text })}
          />
          <Button
            onPress={
              this.state.editingMessage ? this.editMessage : this.postMessage
            }
            title={`${this.state.editingMessage ? "Edit" : "Send"} Message`}
          />
        </View>
      </KeyboardAwareScrollView>
    );
  }

  handleSocketMessage = (data: string) => {
    const messageBroadcast: MessageBroadcast = JSON.parse(data);

    const { message, message_type } = messageBroadcast;
    console.log(`New socket message received, type: ${message_type}`);
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
      /**
       * Any way to avoid this bug?
       */
      console.log("Could not send websockets message!");
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
  };

  postMessage = async () => {
    try {
      const message = {
        message: this.state.input,
        author: "Seanie X",
      };
      const result = await fetch(`${BACKEND_URI}/message`, {
        ...HTTP.POST,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const newMessage = await result.json();
      this.setState(handleSaveMessage(newMessage), () => {
        this.broadcastMessage(MessageBroadcastType.NEW, newMessage);
      });
    } catch (err) {
      this.handleError("POST", err);
    }
  };

  editMessage = async () => {
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
  };

  deleteMessage = async (message: Message) => {
    try {
      await fetch(`${BACKEND_URI}/message/${message.id}`, HTTP.DELETE);
      this.setState(handleDeleteMessage(message.id), () => {
        this.broadcastMessage(MessageBroadcastType.DELETE, message);
      });
    } catch (err) {
      this.handleError("DELETE", err);
    }
  };

  handleError = (method: "GET" | "PUT" | "POST" | "DELETE", err: any) => {
    console.log(`Error for ${method} method: `, err);
  };

  handleTapMessage = (message: Message) => () => {
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
  };

  initializeWebSocketConnection = () => {
    /**
     * TODO: May need to re-initialize on app-foregrounding, and also fetch new messages then?
     */
    try {
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
      console.log("App foregrounded...");
    }

    this.setState({ appState: nextAppState });
  };
}

/** ******************************************************************************
 * State Helpers
 * ********************************************************************************
 */

const handleSaveMessage = (message: Message) => (prevState: IState) => {
  const maybeExists = prevState.messages.find(m => m.id === message.id);
  return {
    input: "",
    messages: maybeExists
      ? prevState.messages
      : prevState.messages.concat(message),
  };
};

const handleEditMessage = (message: Message) => (prevState: IState) => ({
  input: "",
  editingMessage: false,
  editMessageData: undefined,
  messages: prevState.messages.map(m => {
    return m.id === message.id ? message : m;
  }),
});

const handleDeleteMessage = (id: number) => (prevState: IState) => ({
  input: "",
  messages: prevState.messages.filter(m => m.id !== id),
});

/** ******************************************************************************
 * Styles
 * ********************************************************************************
 */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    paddingTop: 75,
    paddingBottom: 45,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  input: {
    marginBottom: 40,
    paddingLeft: 15,
    height: 40,
    borderRadius: 20,
    width: "90%",
    backgroundColor: "#FFFFFF",
  },
  textInput: {
    margin: 12,
    padding: 12,
    height: 40,
    width: "90%",
    borderWidth: 1,
    fontSize: 14,
    borderColor: "rgba(50,50,50,0.5)",
  },
});
