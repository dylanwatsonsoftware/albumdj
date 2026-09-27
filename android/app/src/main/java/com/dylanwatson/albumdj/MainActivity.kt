package com.dylanwatson.albumdj

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { AlbumDjApp() }
    }
}

private val Ink = Color(0xFF141612)
private val Paper = Color(0xFFF4F0E7)
private val Acid = Color(0xFFC9FF32)
private val Coral = Color(0xFFFF786A)

@Composable
private fun AlbumDjApp() {
    MaterialTheme {
        Surface(color = Paper, modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(vertical = 28.dp)) {
                Column(modifier = Modifier.padding(horizontal = 24.dp)) {
                    Text("ALBUM DJ", color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(28.dp))
                    Text(
                        "Your current stack",
                        color = Ink,
                        fontSize = 38.sp,
                        lineHeight = 40.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        "The albums you want close at hand this week.",
                        color = Ink.copy(alpha = 0.62f),
                        fontSize = 17.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                LazyRow(
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 26.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(AlbumDjLibrary.demo().children(AlbumDjLibrary.STACK_ID)) { album ->
                        AlbumCard(album)
                    }
                }

                Column(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Ink)
                        .padding(22.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(Acid))
                        Text(
                            "  ANDROID AUTO READY",
                            color = Acid,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        "Take the stack for a drive",
                        color = Color.White,
                        fontSize = 25.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                    Text(
                        "The car browser can see this demo stack. Spotify and Firebase sync come next.",
                        color = Color.White.copy(alpha = 0.68f),
                        lineHeight = 21.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Button(
                        onClick = { },
                        colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = Ink),
                        modifier = Modifier.padding(top = 18.dp),
                    ) {
                        Text("Prototype build", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun AlbumCard(album: LibraryNode) {
    Column(modifier = Modifier.width(250.dp)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(205.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Coral),
        ) {
            Box(
                modifier = Modifier
                    .size(128.dp)
                    .clip(CircleShape)
                    .background(Ink),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(24.dp).clip(CircleShape).background(Acid))
            }
        }
        Text(
            album.title,
            color = Ink,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(album.subtitle.orEmpty(), color = Ink.copy(alpha = 0.58f), fontSize = 15.sp)
    }
}
