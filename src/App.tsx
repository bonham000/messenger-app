import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

export default class App extends React.Component {
  async componentDidMount() {
    try {
      const data = {
        message: "Hello from Earth",
        author: {
          name: "Seanie X",
        },
      };

      const result = await fetch("http://localhost:8000/post_message", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const response = await result.json();
      console.log(response);
    } catch (err) {
      console.log(err);
    }
  }
  render() {
    return (
      <View style={styles.container}>
        <Text>Open up App.js to start working on your app!</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
